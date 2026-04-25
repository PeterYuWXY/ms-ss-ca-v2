import type { Telegraf } from 'telegraf';
import { Markup } from 'telegraf';
import cron from 'node-cron';
import {
  fetchTokenData,
  fetchSecurityData,
  buildTokenMessage,
  getCommunityLang,
} from '../services/marketData.js';
import { broadcastBriefing } from '../services/briefing.js';
import { broadcastRadar }    from '../services/newTokens.js';
import { incrementActivity } from '../services/leaderboard.js';
import { t, type Lang }      from '../i18n/index.js';
import { generateInviteLink } from '../services/referral.js';
import axios from 'axios';

// ─── Token query trigger ──────────────────────────────────────────────────────
// Pattern: $SYMBOL  #SYMBOL  $0x...  anywhere in the message

const TOKEN_RE = /[\$#]([a-zA-Z0-9]{1,20}|0x[0-9a-fA-F]{10,42})/;

// Per-group cooldown: one lookup every 8 seconds per group
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 8_000;

// ─── Main handler registration ────────────────────────────────────────────────

export function registerMarketHandlers(bot: Telegraf): void {

  // ── Token lookup ─────────────────────────────────────────────────────────
  // In groups: ONLY fires when the bot is @mentioned in the same message.
  // In DM: fires on any $TOKEN / #TOKEN message (no mention needed).
  bot.on('text', async (ctx, next) => {
    const text    = (ctx.message as any)?.text ?? '';
    const inGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

    if (inGroup) {
      // Require @mention — silently pass to next handler if not mentioned
      const botUsername = ctx.botInfo?.username ?? '';
      if (!botUsername || !text.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) {
        return next();
      }
    }

    const match = TOKEN_RE.exec(text);
    if (!match) return next(); // has mention but no token pattern — pass through

    const query  = match[1].trim();
    const chatId = String(ctx.chat?.id ?? '');

    // Per-group cooldown
    if (Date.now() < (cooldowns.get(chatId) ?? 0)) return;
    cooldowns.set(chatId, Date.now() + COOLDOWN_MS);

    const lang = inGroup ? await getCommunityLang(chatId) : 'en' as Lang;

    await ctx.telegram.sendChatAction(ctx.chat!.id, 'typing').catch(() => {});

    const token = await fetchTokenData(query);
    if (!token) {
      await ctx.reply(t(lang, 'token.notFound'));
      return;
    }

    const sec = await fetchSecurityData(token.chainId, token.address);
    const msg = buildTokenMessage(token, sec, lang);

    await ctx.reply(msg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.url(t(lang, 'token.viewChart'), token.url)]]),
    });

    // Non-blocking: track activity for leaderboard
    getCommunityName(chatId).then(name => incrementActivity(chatId, name)).catch(() => {});
  });

  // ── /trending — on-demand in groups or DM ────────────────────────────────
  bot.command('trending', async (ctx) => {
    const chatId = String(ctx.chat?.id ?? '');
    const inGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
    const lang = inGroup ? await getCommunityLang(chatId) : 'en' as Lang;

    await ctx.telegram.sendChatAction(ctx.chat!.id, 'typing').catch(() => {});
    try {
      const { fetchTrendingTokens, buildRadarMessage } = await import('../services/newTokens.js');
      const botname = ctx.botInfo?.username ?? 'MSCommunityAgent_bot';
      const tokens  = await fetchTrendingTokens();
      const msg     = buildRadarMessage(tokens, lang, botname);
      if (msg) await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply(t(lang, 'error.generic'));
    }
  });

  // ── /leaderboard — DM only ────────────────────────────────────────────────
  bot.command('leaderboard', async (ctx) => {
    if (ctx.chat?.type !== 'private') return; // silently ignore in groups

    try {
      const { getWeeklyLeaderboard, getTotalQueriesThisWeek, buildLeaderboardMessage } = await import('../services/leaderboard.js');
      const { getWeekId } = await import('../utils/format.js');
      const botname = ctx.botInfo?.username ?? 'MSCommunityAgent_bot';
      const [entries, total] = await Promise.all([getWeeklyLeaderboard(10), getTotalQueriesThisWeek()]);
      const msg = buildLeaderboardMessage(entries, total, getWeekId(), 'en', botname);
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply(t('en', 'error.generic'));
    }
  });

  // ── /invite — DM only ─────────────────────────────────────────────────────
  bot.command('invite', async (ctx) => {
    if (ctx.chat?.type !== 'private') return; // silently ignore in groups

    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      const MS_API_URL = process.env.MS_API_URL ?? 'http://localhost:3001';
      const res = await axios.get(`${MS_API_URL}/api/v1/communities?ownerTelegramId=${userId}&limit=1`, { timeout: 5000 });
      const community = res.data?.data?.[0];

      if (!community) {
        await ctx.reply('⚠️ You need to register a community first.\n\nUse the MS Platform → "Claim a Bot" to get started.');
        return;
      }

      const botname  = ctx.botInfo?.username ?? 'MSCommunityAgent_bot';
      const link     = generateInviteLink(community.id, botname);
      const commLang = (community.language?.[0] ?? 'en') as Lang;

      await ctx.reply(
        `${t(commLang, 'referral.title')}\n\n` +
        `${t(commLang, 'referral.desc')}\n` +
        `${t(commLang, 'referral.link', { link })}\n\n` +
        t(commLang, 'referral.reward'),
        { parse_mode: 'Markdown' },
      );
    } catch {
      await ctx.reply(t('en', 'error.generic'));
    }
  });

  // ── Scheduled broadcasts ──────────────────────────────────────────────────

  // Daily briefing — 08:00 UTC+8 = 00:00 UTC
  cron.schedule('0 0 * * *', () => {
    console.log('[Cron] Firing daily briefing');
    broadcastBriefing(bot).catch(err => console.error('[Cron][Briefing]', err));
  }, { timezone: 'UTC' });

  // Trending radar — 09:00 and 18:00 UTC+8 = 01:00 and 10:00 UTC
  cron.schedule('0 1,10 * * *', () => {
    console.log('[Cron] Firing trending radar');
    broadcastRadar(bot).catch(err => console.error('[Cron][Radar]', err));
  }, { timezone: 'UTC' });

  console.log('📊 Market handlers registered (token lookup, trending, leaderboard, referral, cron jobs)');
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getCommunityName(chatId: string): Promise<string> {
  try {
    const MS_API_URL = process.env.MS_API_URL ?? 'http://localhost:3001';
    const res = await axios.get(`${MS_API_URL}/api/v1/communities?caBotId=${chatId}`, { timeout: 5000 });
    return res.data?.data?.[0]?.name ?? chatId;
  } catch {
    return chatId;
  }
}
