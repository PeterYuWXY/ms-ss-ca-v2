import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import axios from 'axios';
import http from 'http';
import dns from 'dns';
import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { registerShillingHandlers, restoreActiveExecutions, startExecution, getActiveExecutionsByCommunity } from './handlers/shilling.js';
import { registerMarketHandlers } from './handlers/market.js';
import { acceptOffer, rejectOffer } from './services/msApi.js';
import { setPendingReferrer, claimReferral } from './services/referral.js';

// Escape Telegram Markdown v1 special characters in user-provided text
function escapeMd(text: string): string {
  return text.replace(/[_*`[]/g, '\\$&');
}

// Telegram callback_data limit is 64 bytes.
// Long offer IDs exceed this, so we map them to a 10-char short key.
const offerIdMap = new Map<string, string>(); // shortKey → full offerId

function shortKey(offerId: string): string {
  const key = crypto.createHash('sha1').update(offerId).digest('hex').slice(0, 10);
  offerIdMap.set(key, offerId);
  return key;
}

function resolveOfferId(key: string): string {
  return offerIdMap.get(key) ?? key;
}

/**
 * Async version with API fallback. When the bot restarts the offerIdMap is cleared,
 * so clicking Accept/Decline on an old message would return the raw short key.
 * This fetches pending offers from the API and rebuilds the map when key is missing.
 */
async function resolveOfferIdAsync(key: string): Promise<string> {
  const cached = offerIdMap.get(key);
  if (cached) return cached;
  try {
    const res = await axios.get(`${MS_API_URL}/api/v1/offers?status=pending&limit=100`);
    for (const o of (res.data?.data ?? []) as any[]) {
      const sk = shortKey(o.id); // repopulates map as a side effect
      if (sk === key) return o.id;
    }
  } catch { /* fall through */ }
  return key; // last resort: return key as-is (API will reject with meaningful error)
}

// Force IPv4 globally — fixes node-fetch@2 ETIMEDOUT on macOS with Cisco VPN
// (node-fetch ignores --dns-result-order, so we patch dns.lookup directly)
const _lookup = dns.lookup.bind(dns);
(dns as any).lookup = (hostname: string, options: any, callback: any) => {
  if (typeof options === 'function') return _lookup(hostname, { family: 4 }, options);
  return _lookup(hostname, { ...options, family: 4 }, callback);
};

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MS_API_URL = process.env.MS_API_URL || 'http://localhost:3001';
const NOTIFY_PORT = parseInt(process.env.NOTIFY_PORT ?? '3002');
const PROXY_URL = process.env.HTTPS_PROXY || process.env.https_proxy || '';

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

const botOptions = PROXY_URL
  ? { telegram: { agent: new HttpsProxyAgent(PROXY_URL) as any } }
  : {};

const bot = new Telegraf(BOT_TOKEN, botOptions);

// ==================== Keyboard ====================

const mainKeyboard = Markup.keyboard([
  ['📋 New Offers', '⚡ Active Tasks'],
  ['💰 My Earnings', '📊 Past Campaigns'],
]).resize();

// ==================== Admin check ====================

async function isGroupAdmin(ctx: any): Promise<boolean> {
  const chat = ctx.chat;
  const userId = ctx.from?.id;
  if (!chat || !userId) return false;
  if (chat.type === 'private') return true; // DMs are always allowed
  try {
    const member = await ctx.telegram.getChatMember(chat.id, userId);
    return member.status === 'creator' || member.status === 'administrator';
  } catch {
    return false;
  }
}

async function replyAdminOnly(ctx: any) {
  await ctx.reply(
    '🔒 Only group admins can use this bot.\nAsk the group owner to run commands.',
    { reply_markup: { remove_keyboard: true } }
  );
}

/**
 * Check if the bot itself has admin + pin_messages permission in the group.
 * Returns true if all good, false if the bot lacks required permissions.
 * Sends a reminder message if the bot is not an admin.
 */
async function checkBotAdminAndWarn(ctx: any): Promise<boolean> {
  const chat = ctx.chat;
  if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) return true;
  try {
    const botInfo = await ctx.telegram.getMe();
    const botMember = await ctx.telegram.getChatMember(chat.id, botInfo.id);
    if (botMember.status !== 'administrator') {
      await ctx.reply(
        `⚠️ *Action Required: Make me an Admin*\n\n` +
        `I need admin permission in this group to:\n` +
        `📌 Pin campaign messages\n` +
        `📢 Send campaign content\n\n` +
        `*How to do it:*\n` +
        `1. Open group settings → Administrators\n` +
        `2. Add @${ctx.botInfo?.username ?? 'MSCommunityAgent_bot'} as administrator\n` +
        `3. Enable: ✅ Pin Messages  ✅ Send Messages\n\n` +
        `Then try again.`,
        { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }
      );
      return false;
    }
    // Bot is admin — check pin_messages specifically
    const canPin = (botMember as any).can_pin_messages ?? false;
    if (!canPin) {
      await ctx.reply(
        `⚠️ *Missing Permission: Pin Messages*\n\n` +
        `I'm an admin but I don't have the "Pin Messages" permission.\n\n` +
        `To grant it:\n` +
        `1. Group settings → Administrators → find me\n` +
        `2. Enable: ✅ Pin Messages\n\n` +
        `This is needed to pin campaign posts.`,
        { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }
      );
      return false;
    }
  } catch {
    // Can't check — proceed silently (might be a channel or restricted group)
  }
  return true;
}

// ==================== In-memory pending registrations ====================

const pendingRegistrations = new Map<number, string>(); // userId → walletAddress

// ==================== /start ====================

bot.command('start', async (ctx) => {
  const text = ctx.message?.text ?? '';
  const payload = text.split(' ')[1];

  if (payload?.startsWith('invite_')) {
    const referrerId = payload.slice('invite_'.length);
    const userId = ctx.from?.id;
    if (userId && referrerId) await setPendingReferrer(userId, referrerId);

    await ctx.reply(
      `👋 Hey! I'm *MSCommunityAgent* — your community's marketing co-pilot.\n\n` +
      `You were invited by a friend! Register your Telegram group to start earning USDT from crypto campaigns.\n\n` +
      `📋 *How to get started:*\n` +
      `1️⃣ Visit the MS Platform and click *"Claim a Bot"*\n` +
      `2️⃣ Follow the link back here to connect your wallet\n` +
      `3️⃣ Add me to your group as Admin\n\n` +
      `Use the buttons below once you have your wallet linked:`,
      { parse_mode: 'Markdown', ...mainKeyboard },
    );
    return;
  }

  if (payload?.startsWith('register_')) {
    const walletAddress = payload.slice('register_'.length);

    if (!walletAddress.match(/^0x[0-9a-fA-F]{40}$/)) {
      await ctx.reply('❌ Invalid wallet address. Please go back to the MS Platform and try again.');
      return;
    }

    const userId = ctx.from?.id;
    if (userId) pendingRegistrations.set(userId, walletAddress);

    await ctx.reply(
      `👋 Hey! I'm *MSCommunityAgent*, your gateway to crypto marketing campaigns.\n\n` +
      `✅ Wallet linked: \`${walletAddress}\`\n\n` +
      `📋 *Next steps:*\n` +
      `1️⃣ Add me to your Telegram group\n` +
      `2️⃣ Promote me to *Admin* (grant: pin messages, send messages)\n` +
      `3️⃣ Open the group and send /register\n\n` +
      `I'll register your community and start sending you paid campaigns!`,
      { parse_mode: 'Markdown', ...mainKeyboard }
    );
    return;
  }

  await ctx.reply(
    `👋 Hey! I'm *MSCommunityAgent* — your community's marketing co-pilot.\n\n` +
    `I connect your Telegram group with crypto advertisers, deliver campaign briefs directly here, and help you earn USDT for every completed promotion.\n\n` +
    `Use the buttons below to get started:`,
    { parse_mode: 'Markdown', ...mainKeyboard }
  );
});

// ==================== /register (group only) ====================

bot.command('register', async (ctx) => {
  const chat = ctx.chat;

  if (chat?.type !== 'group' && chat?.type !== 'supergroup') {
    await ctx.reply(
      '⚠️ This command must be used inside your Telegram group.\n\n' +
      '1. Add me to your group\n' +
      '2. Make me an admin\n' +
      '3. Send /register in the group',
      mainKeyboard
    );
    return;
  }

  if (!(await isGroupAdmin(ctx))) {
    await replyAdminOnly(ctx);
    return;
  }

  // Check that the bot itself has admin + pin_messages before proceeding
  if (!(await checkBotAdminAndWarn(ctx))) return;

  const userId = ctx.from?.id;
  if (!userId) return;

  const walletAddress = pendingRegistrations.get(userId);
  if (!walletAddress) {
    await ctx.reply(
      '⚠️ No wallet linked. Visit the MS Platform → "Claim a Bot" and follow the Telegram link first.',
      { reply_markup: { remove_keyboard: true } }
    );
    return;
  }

  try {
    const memberCount = await ctx.telegram.getChatMembersCount(chat.id).catch(() => 0);

    const response = await axios.post(`${MS_API_URL}/api/v1/ca/register-community`, {
      telegramGroupId: String(chat.id),
      telegramGroupName: chat.title ?? 'Unknown Group',
      telegramHandle: (chat as any).username ?? null, // @handle for public groups
      memberCount,
      ownerWallet: walletAddress,
      ownerTelegramId: String(userId),
    });

    const communityId = response.data?.data?.id ?? 'unknown';
    pendingRegistrations.delete(userId);

    // Link referral if this user was invited
    claimReferral(userId, communityId).then(async (referrerId) => {
      if (!referrerId) return;
      try {
        await ctx.telegram.sendMessage(
          referrerId,
          `🎉 *Referral success!*\n\nA group owner you invited just registered their community. Keep sharing your link — more referrals = more bonus earnings!`,
          { parse_mode: 'Markdown' },
        );
      } catch { /* referrer may have blocked the bot */ }
    }).catch(() => {});

    // Group message: soft & non-intrusive — explicitly remove any keyboard so group members never see the buttons
    await ctx.reply(
      `👋 Group assistant is now active and here to support group management behind the scenes.`,
      { reply_markup: { remove_keyboard: true } }
    );

    // DM the admin: full details + ask for language/topic setup
    try {
      await ctx.telegram.sendMessage(
        userId,
        `✅ *Registration confirmed!*\n\n` +
        `📛 Group: ${chat.title}\n` +
        `👥 Members: ${memberCount}\n` +
        `💼 Payout wallet: \`${walletAddress}\`\n` +
        `🆔 Community ID: \`${communityId}\`\n\n` +
        `One last step — set your community profile so advertisers can find you:`,
        { parse_mode: 'Markdown', ...mainKeyboard }
      );
      // Ask language
      await ctx.telegram.sendMessage(
        userId,
        `🌐 *What language is your group primarily in?*\n\n_(Select one — this helps advertisers target the right audience)_`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('🇨🇳 Chinese',    `setlang:${communityId}:zh`),
              Markup.button.callback('🇬🇧 English',    `setlang:${communityId}:en`),
            ],
            [
              Markup.button.callback('🇰🇷 Korean',     `setlang:${communityId}:ko`),
              Markup.button.callback('🇻🇳 Vietnamese', `setlang:${communityId}:vi`),
            ],
          ]),
        }
      );
    } catch {
      // User hasn't started the bot in DM — the group message is sufficient
    }
  } catch (error: unknown) {
    const e = error as any;
    const raw = e?.response?.data?.error;
    const msg = typeof raw === 'string' ? raw
      : typeof raw?.message === 'string' ? raw.message
      : e?.message ?? 'Please try again later.';
    console.error('Error registering community:', error);
    await ctx.reply(`❌ Registration failed: ${msg}`, { reply_markup: { remove_keyboard: true } });
  }
});

// ==================== DM routing helpers ====================

function isGroupChat(ctx: any): boolean {
  const type = ctx.chat?.type;
  return type === 'group' || type === 'supergroup';
}

/**
 * In group context: silently DM the owner without posting anything in the group.
 * In DM: reply directly.
 */
async function withDmRedirect(ctx: any, _groupAck: string, fn: (sendTo: (text: string, extra?: any) => Promise<void>) => Promise<void>): Promise<void> {
  const userId = ctx.from?.id;
  if (isGroupChat(ctx) && userId) {
    const sendToDm = (text: string, extra?: any) =>
      bot.telegram.sendMessage(userId, text, extra ?? {}).then(() => {});
    await fn(sendToDm);
  } else {
    const sendToCtx = (text: string, extra?: any) => ctx.reply(text, extra ?? {}).then(() => {});
    await fn(sendToCtx);
  }
}

// ==================== Community resolver ====================
// Looks up the community linked to this chat/user so we can filter offers/earnings by community.

async function resolveCommunity(ctx: any): Promise<{ id: string; name: string; ownerWallet: string } | null> {
  try {
    const chat = ctx.chat;
    const userId = ctx.from?.id;

    // In a group: look up by Telegram group ID (caBotId)
    if (chat?.type === 'group' || chat?.type === 'supergroup') {
      const res = await axios.get(`${MS_API_URL}/api/v1/communities?caBotId=${chat.id}`);
      const community = res.data?.data?.[0] ?? null;
      return community;
    }

    // In DM: look up by ownerTelegramId
    if (userId) {
      const res = await axios.get(`${MS_API_URL}/api/v1/communities?ownerTelegramId=${userId}`);
      const community = res.data?.data?.[0] ?? null;
      return community;
    }

    return null;
  } catch {
    return null;
  }
}

// ==================== Keyboard button handlers ====================

bot.hears('📋 New Offers', async (ctx) => {
  if (!(await isGroupAdmin(ctx))) { await replyAdminOnly(ctx); return; }

  const community = await resolveCommunity(ctx);
  if (!community) {
    await ctx.reply(
      '⚠️ Your community is not registered yet.\n\nUse the MS Platform → "Claim a Bot" to register first.',
      mainKeyboard
    );
    return;
  }

  await withDmRedirect(ctx, '📬 Checking offers — details sent to your DMs.', async (send) => {
    try {
      const res = await axios.get(`${MS_API_URL}/api/v1/offers?status=pending&communityId=${community.id}&limit=5`);
      const offers: any[] = res.data?.data ?? [];

      if (offers.length === 0) {
        await send('No new offers right now. I\'ll notify you when one arrives! 🔔');
        return;
      }

      const durationLabel: Record<string, string> = { '1w': '1 Week', '2w': '2 Weeks', '4w': '4 Weeks' };
      const chainLabel: Record<number, string> = { 97: 'BSC Testnet', 56: 'BSC Mainnet', 1: 'Ethereum' };

      for (const offer of offers) {
        const rewardUsdt = (Number(BigInt(offer.reward?.amount ?? '0')) / 1_000_000).toFixed(2);
        const pc = offer.task?.promoteContent;
        const req = offer.task?.requirements ?? {};
        const chainId = offer.task?.chainId ?? 97;

        const taskLines = [
          req.pinnedPost ? `📌 Pin 1 post in the group` : null,
          req.groupAds   ? `📢 Post ${req.groupAds} ad message(s) in the group` : null,
        ].filter(Boolean).join('\n');

        const contentSection = pc?.adCopy
          ? `\n\n📝 *Ad Copy to post:*\n${escapeMd(pc.adCopy)}` +
            (pc.contentUrl  ? `\n🔗 ${escapeMd(pc.contentUrl)}` : '') +
            (pc.landingUrl  ? `\n🌐 ${escapeMd(pc.landingUrl)}` : '')
          : '';

        await send(
          `📢 *New Campaign Offer*\n\n` +
          `💰 Reward: *$${rewardUsdt} USDT*\n` +
          `⏱ Duration: ${durationLabel[offer.task?.durationKey] ?? offer.task?.durationKey ?? 'N/A'}\n` +
          `🔗 Chain: ${chainLabel[chainId] ?? `Chain ${chainId}`}\n` +
          `📅 Campaign ends: ${new Date(offer.executionEnd).toLocaleDateString()}\n\n` +
          `*What to do:*\n${taskLines}` +
          contentSection +
          `\n\n_Reward will be released to your wallet within 24h of completing all requirements._`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback('✅ Accept', `accept:${shortKey(offer.id)}`),
                Markup.button.callback('❌ Decline', `reject:${shortKey(offer.id)}`),
              ],
            ]),
          }
        );
      }
    } catch {
      await send('❌ Could not fetch offers. Please try again later.');
    }
  });
});

bot.hears('⚡ Active Tasks', async (ctx) => {
  if (!(await isGroupAdmin(ctx))) { await replyAdminOnly(ctx); return; }

  const community = await resolveCommunity(ctx);
  if (!community) {
    await ctx.reply('⚠️ Community not registered yet. Use the MS Platform → "Claim a Bot" to get started.', { reply_markup: { remove_keyboard: true } });
    return;
  }

  await withDmRedirect(ctx, '⚡ Checking active tasks — details sent to your DMs.', async (send) => {
    try {
      const res = await axios.get(`${MS_API_URL}/api/v1/offers?status=accepted&communityId=${community.id}&limit=10`);
      const tasks: any[] = res.data?.data ?? [];

      if (tasks.length === 0) {
        await send('⚡ No active tasks right now.\nCheck 📋 New Offers to pick one up!');
        return;
      }

      const lines = tasks.map((t, i) => {
        const rewardUsdt = (Number(BigInt(t.reward?.amount ?? '0')) / 1_000_000).toFixed(2);
        return `${i + 1}. ${t.task?.type ?? 'promotion'} — $${rewardUsdt} USDT — ends ${new Date(t.executionEnd).toLocaleDateString()}`;
      }).join('\n');

      await send(`⚡ *Active Tasks for ${community.name}*\n\n${lines}`, { parse_mode: 'Markdown' });
    } catch {
      await send('⚡ No active tasks.');
    }
  });
});

bot.hears('💰 My Earnings', async (ctx) => {
  if (!(await isGroupAdmin(ctx))) { await replyAdminOnly(ctx); return; }

  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply('⚠️ Could not identify your account.', mainKeyboard);
    return;
  }

  await withDmRedirect(ctx, '💰 Fetching earnings — details sent to your DMs.', async (send) => {
    try {
      // Fetch ALL communities owned by this user
      const commRes = await axios.get(`${MS_API_URL}/api/v1/communities?ownerTelegramId=${userId}&limit=50`);
      const communities: any[] = commRes.data?.data ?? [];

      if (communities.length === 0) {
        await send('⚠️ No communities registered yet.\n\nUse the MS Platform → "Claim a Bot" to register first.');
        return;
      }

      let earnedUsdt = 0;
      let pendingUsdt = 0;
      let completedCount = 0;
      let activeCount = 0;

      for (const comm of communities) {
        // Completed offers
        const doneRes = await axios.get(`${MS_API_URL}/api/v1/offers?status=completed&communityId=${comm.id}&limit=100`);
        const done: any[] = doneRes.data?.data ?? [];
        completedCount += done.length;
        earnedUsdt += done.reduce((s, o) => s + Number(BigInt(o.reward?.amount ?? '0')) / 1_000_000, 0);

        // In-progress offers (accepted = running but not yet finalised)
        const activeRes = await axios.get(`${MS_API_URL}/api/v1/offers?status=accepted&communityId=${comm.id}&limit=100`);
        const active: any[] = activeRes.data?.data ?? [];
        activeCount += active.length;
        pendingUsdt += active.reduce((s, o) => s + Number(BigInt(o.reward?.amount ?? '0')) / 1_000_000, 0);
      }

      const wallet = communities[0]?.ownerWallet ?? '—';
      const names = communities.map((c: any) => c.name).join(', ');

      await send(
        `💰 *My Earnings — All Communities*\n\n` +
        `Communities: ${communities.length}\n` +
        `_${escapeMd(names)}_\n\n` +
        `✅ Confirmed earnings: *$${earnedUsdt.toFixed(2)} USDT* (${completedCount} completed task${completedCount !== 1 ? 's' : ''})\n` +
        `⏳ In progress: *$${pendingUsdt.toFixed(2)} USDT* (${activeCount} active task${activeCount !== 1 ? 's' : ''})\n` +
        `📊 Total: *$${(earnedUsdt + pendingUsdt).toFixed(2)} USDT*\n\n` +
        `Payout wallet: \`${wallet}\`\n` +
        `_Rewards are released on-chain within 24h of completing all requirements._`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[MyEarnings]', err);
      await send('💰 Could not fetch earnings. Please try again later.');
    }
  });
});

bot.hears('📊 Past Campaigns', async (ctx) => {
  if (!(await isGroupAdmin(ctx))) { await replyAdminOnly(ctx); return; }

  const community = await resolveCommunity(ctx);
  if (!community) {
    await ctx.reply('⚠️ Community not registered yet. Use the MS Platform → "Claim a Bot" to get started.', { reply_markup: { remove_keyboard: true } });
    return;
  }

  await withDmRedirect(ctx, '📊 Fetching campaign history — details sent to your DMs.', async (send) => {
    try {
      const res = await axios.get(`${MS_API_URL}/api/v1/offers?status=completed&communityId=${community.id}&limit=10`);
      const past: any[] = res.data?.data ?? [];

      if (past.length === 0) {
        await send(`📊 No completed campaigns yet for *${community.name}*.\nPick up your first offer from 📋 New Offers!`, { parse_mode: 'Markdown' });
        return;
      }

      const lines = past.map((o, i) => {
        const rewardUsdt = (Number(BigInt(o.reward?.amount ?? '0')) / 1_000_000).toFixed(2);
        return `${i + 1}. ${o.task?.type ?? 'promotion'} — $${rewardUsdt} USDT — ${new Date(o.executionEnd).toLocaleDateString()}`;
      }).join('\n');

      await send(`📊 *Past Campaigns for ${community.name}*\n\n${lines}`, { parse_mode: 'Markdown' });
    } catch {
      await send('📊 No past campaigns found.');
    }
  });
});

// ==================== Inline button callbacks ====================

bot.action(/^accept:(.+)$/, async (ctx) => {
  const offerId = await resolveOfferIdAsync((ctx.match as RegExpMatchArray)[1]);
  try {
    await ctx.answerCbQuery('Accepting...');

    // Fetch offer details upfront (once) — also gives us the correct communityId
    let offerData: any = null;
    let community: any = null;
    try {
      const offerRes = await axios.get(`${MS_API_URL}/api/v1/offers/${offerId}`);
      offerData = offerRes.data?.data;
      const communityId = offerData?.communityId;
      if (communityId) {
        const commRes = await axios.get(`${MS_API_URL}/api/v1/communities/${communityId}`);
        community = commRes.data?.data ?? null;
      }
    } catch { /* fall through to context fallback */ }

    if (!community) community = await resolveCommunity(ctx);
    if (!community) {
      await ctx.reply('⚠️ Cannot resolve community. Make sure the bot is registered in this group.');
      return;
    }

    // Extract offer details (or use safe defaults)
    let requirements = { pinnedPost: true, groupAds: 3, discussions: 0 };
    let executionEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    let promoteContent: { adCopy?: string; contentUrl?: string; landingUrl?: string } | null = null;
    if (offerData?.executionEnd) executionEnd = offerData.executionEnd;
    if (offerData?.task?.requirements) requirements = { ...requirements, ...offerData.task.requirements };
    if (offerData?.task?.promoteContent) promoteContent = offerData.task.promoteContent;

    // Sequential queue check: if this community already has active executions,
    // queue the new one to start after the last one ends.
    const ownerChatId = ctx.from?.id;
    let startAt: Date | undefined;
    const activeExecs = await getActiveExecutionsByCommunity(community.id);
    if (activeExecs.length > 0) {
      const latestEndMs = activeExecs.reduce((max, s) => {
        const t = new Date(s.executionEnd).getTime();
        return t > max ? t : max;
      }, 0);
      const proposedStart = new Date(latestEndMs + 60_000); // 1 min buffer
      const campaignEndMs = new Date(executionEnd).getTime();
      const minRunMs = 60 * 60 * 1000; // need at least 1h of run time

      if (proposedStart.getTime() + minRunMs > campaignEndMs) {
        // No room in the queue — decline gracefully without calling acceptOffer
        await ctx.editMessageReplyMarkup(undefined);
        if (ownerChatId) {
          await bot.telegram.sendMessage(
            ownerChatId,
            `⚠️ *Cannot accept this campaign*\n\n` +
            `Your current campaigns run until *${new Date(latestEndMs).toLocaleString()}*.\n\n` +
            `This campaign ends on *${new Date(executionEnd).toLocaleString()}* — not enough time to complete it after your current queue.\n\n` +
            `Please wait for your current campaigns to finish before accepting this one.`,
            { parse_mode: 'Markdown', ...mainKeyboard }
          );
        }
        return;
      }

      startAt = proposedStart;
    }

    // Accept offer via MS API → get executionId + campaignId
    let result: any;
    try {
      result = await acceptOffer(offerId, community.id);
    } catch (acceptErr: any) {
      const apiError = acceptErr?.response?.data?.error ?? '';
      const isSlotsFull = apiError === 'SLOTS_FULL' || acceptErr?.response?.status === 409;
      await ctx.editMessageReplyMarkup(undefined);
      if (isSlotsFull) {
        if (ownerChatId) {
          await bot.telegram.sendMessage(
            ownerChatId,
            `❌ *All slots for this campaign are now full*\n\n` +
            `Your community *${escapeMd(community.name)}* was not among the first to accept — ` +
            `all promotion slots have been taken by other communities.\n\n` +
            `📬 *Don't worry* — new campaign offers matching your community profile will be sent automatically as soon as they become available. Stay tuned!`,
            { parse_mode: 'Markdown', ...mainKeyboard }
          );
        }
        return;
      }
      const msg = acceptErr?.response?.data?.message ?? acceptErr?.response?.data?.error ?? 'Failed to accept';
      await ctx.reply(`❌ ${msg}`, mainKeyboard);
      return;
    }

    const { executionId, campaignId } = result.data ?? {};

    await ctx.editMessageReplyMarkup(undefined);

    if (executionId && campaignId) {
      // chatId = the group chat (for posting ads) — use caBotId from community, NOT ctx.chat.id
      // (Accept is pressed in DM, so ctx.chat.id would be the owner's user ID, not the group)
      const chatId = (community as any).caBotId ?? (community as any).telegramGroupId ?? community.id;
      await startExecution(bot, executionId, offerId, community.id, community.name, chatId, ownerChatId ?? chatId, 'Promotion campaign', requirements, executionEnd, promoteContent, campaignId, startAt);
    } else {
      await ctx.reply(`✅ Offer accepted!`, mainKeyboard);
    }
  } catch (err: any) {
    const msg = err?.response?.data?.error ?? 'Failed to accept';
    await ctx.answerCbQuery(msg);
    await ctx.reply(`❌ ${msg}`, mainKeyboard);
  }
});

bot.action(/^reject:(.+)$/, async (ctx) => {
  const offerId = await resolveOfferIdAsync((ctx.match as RegExpMatchArray)[1]);
  try {
    await ctx.answerCbQuery('Declining...');

    let community: any = null;
    try {
      const offerRes = await axios.get(`${MS_API_URL}/api/v1/offers/${offerId}`);
      const communityId = offerRes.data?.data?.communityId;
      if (communityId) {
        const commRes = await axios.get(`${MS_API_URL}/api/v1/communities/${communityId}`);
        community = commRes.data?.data ?? null;
      }
    } catch { /* fall through */ }

    if (!community) community = await resolveCommunity(ctx);

    if (!community) {
      await ctx.reply('⚠️ Cannot resolve community.', mainKeyboard);
      return;
    }

    await rejectOffer(offerId, community.id);
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply(`Fine, see you next time! 👋`, mainKeyboard);
  } catch {
    await ctx.answerCbQuery('Failed — try again');
  }
});

// ==================== Community profile setup callbacks ====================

const TOPIC_TAGS_BOT = ['RWA', 'Trading', 'DeFi', 'Prediction', 'Alpha', 'NFT', 'GameFi', 'Layer2', 'AI', 'Meme'];

// Temp store for topic selections during setup: communityId → Set<string>
const pendingTopics = new Map<string, Set<string>>();

bot.action(/^setlang:([^:]+):(.+)$/, async (ctx) => {
  const communityId = (ctx.match as RegExpMatchArray)[1];
  const lang        = (ctx.match as RegExpMatchArray)[2];
  await ctx.answerCbQuery();
  try {
    await axios.put(`${MS_API_URL}/api/v1/communities/${communityId}`, { language: [lang] });
    await ctx.editMessageText(
      `✅ Language set to *${lang === 'zh' ? 'Chinese' : lang === 'ko' ? 'Korean' : lang === 'vi' ? 'Vietnamese' : 'English'}*.\n\nNow pick your community topic tags:`,
      { parse_mode: 'Markdown' }
    );
    pendingTopics.set(communityId, new Set());
    await sendTopicKeyboard(ctx, communityId);
  } catch {
    await ctx.reply('❌ Could not save language. Please try again later.');
  }
});

async function sendTopicKeyboard(ctx: any, communityId: string) {
  const selected = pendingTopics.get(communityId) ?? new Set<string>();
  const rows: any[][] = [];
  for (let i = 0; i < TOPIC_TAGS_BOT.length; i += 3) {
    rows.push(TOPIC_TAGS_BOT.slice(i, i + 3).map(t =>
      Markup.button.callback(
        selected.has(t) ? `✅ ${t}` : t,
        `settopic:${communityId}:${t}`
      )
    ));
  }
  rows.push([Markup.button.callback('💾 Save & Done', `savetopics:${communityId}`)]);
  await ctx.reply(
    `🏷 *Select topic tags for your community* (tap to toggle, then Save):`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }
  );
}

bot.action(/^settopic:([^:]+):(.+)$/, async (ctx) => {
  const communityId = (ctx.match as RegExpMatchArray)[1];
  const topic       = (ctx.match as RegExpMatchArray)[2];
  await ctx.answerCbQuery();
  const set = pendingTopics.get(communityId) ?? new Set<string>();
  set.has(topic) ? set.delete(topic) : set.add(topic);
  pendingTopics.set(communityId, set);

  const rows: any[][] = [];
  for (let i = 0; i < TOPIC_TAGS_BOT.length; i += 3) {
    rows.push(TOPIC_TAGS_BOT.slice(i, i + 3).map(t =>
      Markup.button.callback(
        set.has(t) ? `✅ ${t}` : t,
        `settopic:${communityId}:${t}`
      )
    ));
  }
  rows.push([Markup.button.callback('💾 Save & Done', `savetopics:${communityId}`)]);
  await ctx.editMessageReplyMarkup(Markup.inlineKeyboard(rows).reply_markup);
});

bot.action(/^savetopics:(.+)$/, async (ctx) => {
  const communityId = (ctx.match as RegExpMatchArray)[1];
  await ctx.answerCbQuery();
  const tags = Array.from(pendingTopics.get(communityId) ?? []);
  try {
    await axios.put(`${MS_API_URL}/api/v1/communities/${communityId}`, { tags });
    pendingTopics.delete(communityId);
    await ctx.editMessageText(
      `✅ *Community profile saved!*\n\nTags: ${tags.length > 0 ? tags.join(', ') : 'none'}\n\nYou're all set — campaign offers will arrive here in your DMs when advertisers target your community. 🎉`,
      { parse_mode: 'Markdown' }
    );
  } catch {
    await ctx.reply('❌ Could not save topics. Please try again later.');
  }
});

// ==================== Market features (token lookup, cron jobs) ====================

registerMarketHandlers(bot);

// ==================== Small talk → keyboard ====================

bot.on('text', async (ctx) => {
  const text = ctx.message?.text ?? '';
  // Skip if it's a command or keyboard button
  if (text.startsWith('/') || ['📋 New Offers', '⚡ Active Tasks', '💰 My Earnings', '📊 Past Campaigns'].includes(text)) return;

  // In groups: only respond to admins
  const chat = ctx.chat;
  if (chat?.type === 'group' || chat?.type === 'supergroup') {
    if (!(await isGroupAdmin(ctx))) return; // silently ignore non-admins
  }

  await ctx.reply(
    `Hi! I'm MSCommunityAgent. Use the buttons below to manage your campaigns and earnings.`,
    mainKeyboard
  );
});

// ==================== Register shilling handlers ====================

registerShillingHandlers(bot);

// ==================== HTTP notification server ====================
// MS API calls POST /notify-offer after distributing offers to push real-time alerts to CA Bots.

const notifyServer = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/notify-offer') {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body) as {
        ownerTelegramId?: string | number | null;
        chatId: string | number;
        offerId: string;
        projectName?: string;
        rewardAmount?: string;
        durationKey?: string;
        deadline?: string;
        chainId?: number;
        promoteContent?: { contentUrl?: string; adCopy?: string; landingUrl?: string } | null;
        requirements?: { pinnedPost?: boolean; groupAds?: number; discussions?: number };
      };

      const rewardUsdt = payload.rewardAmount
        ? (Number(BigInt(payload.rewardAmount)) / 1_000_000).toFixed(2)
        : '0.00';

      const durationLabel: Record<string, string> = { '1w': '1 Week', '2w': '2 Weeks', '4w': '4 Weeks' };
      const chainLabel: Record<number, string> = { 97: 'BSC Testnet', 56: 'BSC Mainnet', 1: 'Ethereum' };

      const req = payload.requirements ?? {};
      const taskLines = [
        req.pinnedPost ? `📌 Pin 1 post in the group` : null,
        req.groupAds   ? `📢 Post ${req.groupAds} ad message(s) in the group` : null,
      ].filter(Boolean).join('\n');

      const pc = payload.promoteContent;
      const contentLines = [
        pc?.adCopy       ? `\n📝 *Ad Copy:*\n${escapeMd(pc.adCopy)}` : '',
        pc?.contentUrl   ? `\n🔗 Content URL: ${escapeMd(pc.contentUrl)}` : '',
        pc?.landingUrl   ? `🌐 Landing Page: ${escapeMd(pc.landingUrl)}` : '',
      ].join('');

      const notifyTarget = payload.ownerTelegramId ?? payload.chatId;

      await bot.telegram.sendMessage(
        notifyTarget,
        `🚀 *New Campaign Offer*\n\n` +
        `🎯 Campaign: *${payload.projectName ?? 'Crypto Campaign'}*\n` +
        `⏱ Duration: ${durationLabel[payload.durationKey ?? ''] ?? payload.durationKey ?? 'N/A'}\n` +
        `🔗 Chain: ${chainLabel[payload.chainId ?? 97] ?? `Chain ${payload.chainId}`}\n` +
        `💰 Your Reward: *$${rewardUsdt} USDT*\n` +
        (payload.deadline ? `📅 Accept by: ${new Date(payload.deadline).toLocaleDateString()}\n` : '') +
        `\n*What you need to do:*\n${taskLines}` +
        contentLines +
        `\n\n_Reward will be released to your wallet within 24h of completing all requirements._\n\n` +
        `Tap below to accept or decline:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[
            Markup.button.callback('✅ Accept', `accept:${shortKey(payload.offerId)}`),
            Markup.button.callback('❌ Decline', `reject:${shortKey(payload.offerId)}`),
          ]]),
        }
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error('[NotifyServer] Error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false }));
    }
  });
});

notifyServer.listen(NOTIFY_PORT, () => {
  console.log(`🔔 Notification server listening on port ${NOTIFY_PORT}`);
});

// ==================== Launch ====================

bot.launch();
console.log('🤖 MSCommunityAgent Bot started (@MSCommunityAgent_bot)');

restoreActiveExecutions(bot).catch(console.error);

// On startup: notify community owners of any pending offers they haven't seen yet
async function notifyPendingOffersOnStartup() {
  try {
    const res = await axios.get(`${MS_API_URL}/api/v1/offers?status=pending&limit=100`);
    const offers: any[] = res.data?.data ?? [];
    if (offers.length === 0) return;

    const durationLabel: Record<string, string> = { '1w': '1 Week', '2w': '2 Weeks', '4w': '4 Weeks' };
    const chainLabel: Record<number, string> = { 97: 'BSC Testnet', 56: 'BSC Mainnet', 1: 'Ethereum' };

    // Group offers by communityId, then look up ownerTelegramId
    const communityIds = [...new Set(offers.map((o: any) => o.communityId))];
    for (const communityId of communityIds) {
      try {
        const commRes = await axios.get(`${MS_API_URL}/api/v1/communities/${communityId}`);
        const community = commRes.data?.data;
        const ownerTgId = community?.ownerTelegramId;
        if (!ownerTgId) continue;

        const communityOffers = offers.filter((o: any) => o.communityId === communityId);
        for (const offer of communityOffers) {
          const rewardUsdt = (Number(BigInt(offer.reward?.amount ?? '0')) / 1_000_000).toFixed(2);
          const pc = offer.task?.promoteContent;
          const req = offer.task?.requirements ?? {};
          const chainId = offer.task?.chainId ?? 97;
          const taskLines = [
            req.pinnedPost ? `📌 Pin 1 post in the group` : null,
            req.groupAds   ? `📢 Post ${req.groupAds} ad message(s)` : null,
          ].filter(Boolean).join('\n');
          const contentSection = pc?.adCopy
            ? `\n\n📝 *Ad Copy:*\n${escapeMd(pc.adCopy)}` +
              (pc.contentUrl ? `\n🔗 ${escapeMd(pc.contentUrl)}` : '') +
              (pc.landingUrl ? `\n🌐 ${escapeMd(pc.landingUrl)}` : '')
            : '';

          await bot.telegram.sendMessage(
            ownerTgId,
            `🚀 *New Campaign Offer*\n\n` +
            `💰 Reward: *$${rewardUsdt} USDT*\n` +
            `⏱ Duration: ${durationLabel[offer.task?.durationKey] ?? offer.task?.durationKey ?? 'N/A'}\n` +
            `🔗 Chain: ${chainLabel[chainId] ?? `Chain ${chainId}`}\n` +
            `📅 Campaign ends: ${new Date(offer.executionEnd).toLocaleDateString()}\n\n` +
            `*What to do:*\n${taskLines}` +
            contentSection +
            `\n\n_Reward will be released to your wallet within 24h of completing all requirements._`,
            {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([[
                Markup.button.callback('✅ Accept', `accept:${shortKey(offer.id)}`),
                Markup.button.callback('❌ Decline', `reject:${shortKey(offer.id)}`),
              ]]),
            }
          );
        }
      } catch { /* skip community if unreachable */ }
    }
    console.log(`[Startup] Notified owners of ${offers.length} pending offer(s)`);
  } catch (err) {
    console.error('[Startup] Failed to notify pending offers:', err);
  }
}

setTimeout(() => notifyPendingOffersOnStartup(), 3000);

process.once('SIGINT', () => { bot.stop('SIGINT'); notifyServer.close(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); notifyServer.close(); });
