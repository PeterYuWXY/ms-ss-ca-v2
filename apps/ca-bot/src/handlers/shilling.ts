import type { Telegraf } from 'telegraf';
import { Markup } from 'telegraf';
import { Redis } from 'ioredis';
import { reportAction, completeTask, failTask } from '../services/msApi.js';

// ==================== Redis ====================

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  keyPrefix: 'ca-bot:exec:',
  lazyConnect: true,
});

redis.on('error', (err) => {
  // Non-fatal: log but don't crash if Redis is unavailable
  console.warn('[Redis] Connection error (execution state may not persist):', err.message);
});

// ==================== Types ====================

export interface ExecutionState {
  executionId: string;
  offerId: string;
  communityId: string;
  communityName: string;         // Human-readable group name — included in all owner DMs
  chatId: number | string;       // Telegram group chat ID (for posting ads)
  ownerChatId: number | string;  // Owner's personal TG user ID (for DM management messages)
  campaignBrief: string;
  promoteContent?: { adCopy?: string; contentUrl?: string; landingUrl?: string } | null;
  trackingUrl?: string;          // click-tracking redirect URL (shown as inline button)
  adSchedule: string[];          // ISO timestamps for each scheduled ad post
  startAt?: string;              // ISO — if set and in future, execution is queued (not yet started)
  requirements: {
    pinnedPost: boolean;
    groupAds: number;
    discussions: number;
  };
  executionEnd: string;        // ISO timestamp
  actions: Array<{
    type: 'pinned_post' | 'group_ad' | 'discussion';
    messageId?: number;
    timestamp: string;
  }>;
  pinnedAt?: string;
  unpinnedAt?: string;
  reminderCount: number;       // 0-3, after 3 → mark failed
  nextCheckAt: string;         // ISO timestamp for next deadline/reminder check
  completed: boolean;
}

const KEY_PREFIX = 'state:';
const TTL_DAYS = 10;

function execKey(executionId: string) { return `${KEY_PREFIX}${executionId}`; }

async function saveState(state: ExecutionState): Promise<void> {
  try {
    await redis.setex(execKey(state.executionId), TTL_DAYS * 86400, JSON.stringify(state));
  } catch { /* Redis unavailable — continue without persistence */ }
}

async function loadState(executionId: string): Promise<ExecutionState | null> {
  try {
    const raw = await redis.get(execKey(executionId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function deleteState(executionId: string): Promise<void> {
  try { await redis.del(execKey(executionId)); } catch { /* ignore */ }
}

async function getAllActiveStates(): Promise<ExecutionState[]> {
  try {
    const keys = await redis.keys(`${KEY_PREFIX}*`);
    const states: ExecutionState[] = [];
    for (const key of keys) {
      const raw = await redis.get(key.replace('ca-bot:exec:', ''));
      if (raw) {
        try { states.push(JSON.parse(raw)); } catch { /* skip corrupt */ }
      }
    }
    return states;
  } catch { return []; }
}

// ==================== Timer management ====================

// In-memory map of setTimeout handles: executionId → handle
const timers = new Map<string, ReturnType<typeof setTimeout>>();
// Per-execution ad post timers (multiple per execution)
const adTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

function clearExecTimer(executionId: string) {
  const t = timers.get(executionId);
  if (t) { clearTimeout(t); timers.delete(executionId); }
}

function clearAdTimers(executionId: string) {
  const handles = adTimers.get(executionId);
  if (handles) { handles.forEach(clearTimeout); adTimers.delete(executionId); }
}

function scheduleAt(executionId: string, isoTime: string, fn: () => void) {
  clearExecTimer(executionId);
  const delayMs = Math.max(0, new Date(isoTime).getTime() - Date.now());
  const handle = setTimeout(fn, delayMs);
  timers.set(executionId, handle);
}

// ==================== Promote content helpers ====================

/** Builds plain-text ad message body. Tracking URL is added as an inline button, not in text. */
function buildAdContent(
  pc: { adCopy?: string; contentUrl?: string; landingUrl?: string } | null | undefined,
): string {
  if (!pc?.adCopy) return '';
  const parts = [pc.adCopy];
  if (pc.contentUrl) parts.push(pc.contentUrl);
  return parts.join('\n');
}

/** Returns Telegraf extra options including an inline URL button when trackingUrl is set. */
function adMessageExtra(trackingUrl?: string): object {
  if (!trackingUrl) return {};
  return Markup.inlineKeyboard([[Markup.button.url('🔗 Visit Project', trackingUrl)]]);
}

function computeAdSchedule(now: Date, executionEnd: Date, count: number): string[] {
  if (count === 0) return [];
  // First ad posts immediately (60s delay to let the pin settle first).
  // Remaining ads spread evenly over the campaign duration.
  const FIRST_DELAY_MS = 60_000;
  const schedule: string[] = [new Date(now.getTime() + FIRST_DELAY_MS).toISOString()];
  if (count === 1) return schedule;

  const totalMs = Math.max(executionEnd.getTime() - now.getTime(), 0);
  const remaining = count - 1;
  const interval = totalMs / (remaining + 1);
  for (let i = 1; i <= remaining; i++) {
    schedule.push(new Date(now.getTime() + interval * i).toISOString());
  }
  return schedule;
}

function scheduleAdPosts(bot: Telegraf, state: ExecutionState, adText: string, scheduleOffset = 0): void {
  const { executionId, chatId, ownerChatId, communityName, adSchedule, requirements, trackingUrl } = state;
  const total = requirements.groupAds;
  const handles: ReturnType<typeof setTimeout>[] = [];

  adSchedule.forEach((isoTime, idx) => {
    const adNumber = scheduleOffset + idx + 1;
    const delayMs = Math.max(0, new Date(isoTime).getTime() - Date.now());
    const handle = setTimeout(async () => {
      try {
        const current = await loadState(executionId);
        if (!current || current.completed) return;

        const sent = await bot.telegram.sendMessage(chatId, adText, adMessageExtra(trackingUrl));
        await recordAd(executionId, sent.message_id);

        if (adNumber < total) {
          await bot.telegram.sendMessage(
            ownerChatId,
            `📢 *${communityName}* — Ad ${adNumber}/${total} automatically posted.`,
            { parse_mode: 'Markdown' },
          );
        }
      } catch (err) {
        console.error(`[Shilling] Scheduled ad ${adNumber}/${total} failed:`, err);
      }
    }, delayMs);
    handles.push(handle);
  });

  if (handles.length > 0) {
    adTimers.set(executionId, (adTimers.get(executionId) ?? []).concat(handles));
  }
}

// ==================== Completion check ====================

async function checkAndFinalize(bot: Telegraf, state: ExecutionState): Promise<void> {
  const { executionId, ownerChatId, communityName, requirements, actions, reminderCount } = state;

  // All management messages go to DM (ownerChatId), not the group
  const dm = ownerChatId;
  const groupLabel = `*${communityName}*`;

  const pinnedDone = !requirements.pinnedPost || !!state.pinnedAt;
  const adsDone = actions.filter(a => a.type === 'group_ad').length >= requirements.groupAds;
  const isComplete = pinnedDone && adsDone;

  if (isComplete) {
    try {
      await completeTask(executionId, {
        actionCount: actions.length,
        pinnedAt: state.pinnedAt,
        unpinnedAt: state.unpinnedAt,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Shilling] completeTask API error:', err);
    }

    await bot.telegram.sendMessage(
      dm,
      `✅ *Campaign completed — ${groupLabel}*\n\n` +
      `All requirements met. Your reward will be released to your wallet shortly.\n\n` +
      `📌 Pin duration: ${state.pinnedAt ? formatDuration(state.pinnedAt, state.unpinnedAt) : '—'}\n` +
      `📢 Ads sent: ${actions.filter(a => a.type === 'group_ad').length}/${requirements.groupAds}`,
      { parse_mode: 'Markdown' }
    );

    clearExecTimer(executionId);
    clearAdTimers(executionId);
    await deleteState(executionId);
    return;
  }

  const newCount = reminderCount + 1;

  if (newCount > 3) {
    try {
      await failTask(executionId, `Campaign not completed after ${reminderCount} reminders.`);
    } catch (err) {
      console.error('[Shilling] failTask API error:', err);
    }

    await bot.telegram.sendMessage(
      dm,
      `❌ *Campaign closed — ${groupLabel}*\n\n` +
      `The campaign was not completed after 3 reminders. No USDT will be paid for this task.\n\n` +
      `You can still accept new campaigns via 📋 New Offers.`,
      { parse_mode: 'Markdown' }
    );

    clearExecTimer(executionId);
    clearAdTimers(executionId);
    await deleteState(executionId);
    return;
  }

  const missingItems: string[] = [];
  if (!pinnedDone) missingItems.push('📌 Pinned post — use /pin <text> in your group');
  if (!adsDone) {
    const missing = requirements.groupAds - actions.filter(a => a.type === 'group_ad').length;
    missingItems.push(`📢 ${missing} more ad post(s) — use /ad <text> in your group`);
  }

  const nextCheckAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const updatedState: ExecutionState = { ...state, reminderCount: newCount, nextCheckAt };
  await saveState(updatedState);

  await bot.telegram.sendMessage(
    dm,
    `⚠️ *Campaign reminder ${newCount}/3 — ${groupLabel}*\n\n` +
    `This campaign is not yet complete. You have *24 hours* to finish:\n\n` +
    missingItems.map(m => `• ${m}`).join('\n') +
    `\n\nIf not completed in ${3 - newCount} more reminder(s), the reward will be forfeited.`,
    { parse_mode: 'Markdown' }
  );

  scheduleAt(executionId, nextCheckAt, () => checkAndFinalize(bot, updatedState));
}

function formatDuration(from: string, to?: string): string {
  const ms = (to ? new Date(to) : new Date()).getTime() - new Date(from).getTime();
  const hours = Math.round(ms / 3600000);
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h`;
}

// ==================== Public API ====================

/**
 * Internal: pins campaign content, schedules ad posts, DMs owner with start confirmation.
 * Called immediately on accept (no queue) or deferred via setTimeout when queued.
 */
async function _doStartExecution(bot: Telegraf, state: ExecutionState): Promise<void> {
  const { executionId, chatId, ownerChatId, communityName, requirements, promoteContent, trackingUrl, adSchedule, executionEnd } = state;
  const adText = buildAdContent(promoteContent);

  // Auto-pin: post campaign content in group and pin it immediately
  if (requirements.pinnedPost && adText) {
    try {
      const sent = await bot.telegram.sendMessage(chatId, adText, adMessageExtra(trackingUrl));
      await bot.telegram.pinChatMessage(chatId as number, sent.message_id);
      await recordPinned(executionId, sent.message_id);
    } catch (err) {
      console.error('[Shilling] Auto-pin failed:', err);
    }
  }

  // Schedule ad posts evenly distributed over campaign duration
  if (adText && adSchedule.length > 0) {
    scheduleAdPosts(bot, state, adText);
  }

  // Clear startAt from persisted state (execution has now begun)
  const startedState = { ...state, startAt: undefined };
  await saveState(startedState);

  const durationDays = Math.max(1, Math.round((new Date(executionEnd).getTime() - Date.now()) / 86400000));
  const adCount = requirements.groupAds;

  await bot.telegram.sendMessage(
    ownerChatId,
    `✅ *Campaign started — ${communityName}*\n\n` +
    (requirements.pinnedPost && adText ? `📌 Pinned the campaign post in your group\n` : '') +
    (adCount > 0 ? `📢 Will automatically post ${adCount} ad${adCount > 1 ? 's' : ''} evenly over ${durationDays} day${durationDays !== 1 ? 's' : ''}\n` : '') +
    `\n⏰ Campaign ends: ${new Date(executionEnd).toLocaleString()}\n\n` +
    `_I'll notify you here when all posts are done. Reward will be released to your wallet within 24h of completing all requirements._`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * Called from bot when admin accepts an offer.
 * If startAt is provided and in the future, the execution is queued — pin/ads fire at startAt.
 * Otherwise, auto-posts pin + schedules ads immediately. DMs owner with status.
 */
export async function startExecution(
  bot: Telegraf,
  executionId: string,
  offerId: string,
  communityId: string,
  communityName: string,
  chatId: number | string,
  ownerChatId: number | string,
  campaignBrief: string,
  requirements: ExecutionState['requirements'],
  executionEnd: string,
  promoteContent?: { adCopy?: string; contentUrl?: string; landingUrl?: string } | null,
  campaignId?: string,
  startAt?: Date,
): Promise<void> {
  const now = new Date();
  const isQueued = startAt != null && startAt > now;
  const effectiveStart = isQueued ? startAt! : now;
  const adSchedule = computeAdSchedule(effectiveStart, new Date(executionEnd), requirements.groupAds);

  // Build tracking URL — shown as an inline button so it's always clickable in Telegram
  const MS_API_URL = process.env.MS_API_URL || 'http://localhost:3001';
  const trackingUrl = (campaignId && promoteContent?.landingUrl)
    ? `${MS_API_URL}/r/${campaignId}/${communityId}`
    : undefined;

  const state: ExecutionState = {
    executionId,
    offerId,
    communityId,
    communityName,
    chatId,
    ownerChatId,
    campaignBrief,
    promoteContent: promoteContent ?? null,
    trackingUrl,
    adSchedule,
    startAt: isQueued ? startAt!.toISOString() : undefined,
    requirements,
    executionEnd,
    actions: [],
    reminderCount: 0,
    nextCheckAt: executionEnd,
    completed: false,
  };

  await saveState(state);

  if (isQueued) {
    const durationDays = Math.max(1, Math.round((new Date(executionEnd).getTime() - startAt!.getTime()) / 86400000));
    const adCount = requirements.groupAds;

    await bot.telegram.sendMessage(
      ownerChatId,
      `⏳ *Campaign queued — ${communityName}*\n\n` +
      `Your current campaign is still running. This one will start on:\n` +
      `📅 *${startAt!.toLocaleString()}*\n\n` +
      (adCount > 0 ? `📢 Will post ${adCount} ad${adCount > 1 ? 's' : ''} over ${durationDays} day${durationDays !== 1 ? 's' : ''} starting then\n` : '') +
      `⏰ Campaign ends: ${new Date(executionEnd).toLocaleString()}\n\n` +
      `_I'll notify you when the campaign starts._`,
      { parse_mode: 'Markdown' }
    );

    const delayMs = startAt!.getTime() - now.getTime();
    const startHandle = setTimeout(async () => {
      try { await _doStartExecution(bot, state); } catch (err) {
        console.error('[Shilling] Deferred start failed:', err);
      }
    }, delayMs);
    // Store in adTimers so it's cleared if this execution is cancelled
    adTimers.set(executionId, [startHandle]);
  } else {
    await _doStartExecution(bot, state);
  }

  // Schedule completion check at executionEnd (always, regardless of queue)
  scheduleAt(executionId, executionEnd, () => checkAndFinalize(bot, state));
}

/**
 * Records a pin action and updates state.
 */
export async function recordPinned(executionId: string, messageId: number): Promise<void> {
  const state = await loadState(executionId);
  if (!state) return;

  const updated: ExecutionState = {
    ...state,
    pinnedAt: new Date().toISOString(),
    actions: [...state.actions, { type: 'pinned_post', messageId, timestamp: new Date().toISOString() }],
  };
  await saveState(updated);

  try {
    await reportAction(executionId, { type: 'pinned_post', messageId });
  } catch { /* non-fatal */ }
}

/**
 * Records an unpin event — updates Redis state and reports to MS API.
 */
export async function recordUnpinned(executionId: string): Promise<void> {
  const state = await loadState(executionId);
  if (!state) return;
  const now = new Date().toISOString();
  await saveState({ ...state, unpinnedAt: now });

  try {
    await reportAction(executionId, { type: 'unpinned_post', metadata: { unpinnedAt: now } });
  } catch { /* non-fatal */ }
}

/**
 * Records an ad post and updates state.
 */
export async function recordAd(executionId: string, messageId: number): Promise<void> {
  const state = await loadState(executionId);
  if (!state) return;

  const updated: ExecutionState = {
    ...state,
    actions: [...state.actions, { type: 'group_ad', messageId, timestamp: new Date().toISOString() }],
  };
  await saveState(updated);

  try {
    await reportAction(executionId, { type: 'group_ad', messageId });
  } catch { /* non-fatal */ }
}

/**
 * Returns active execution state for a given community (for status display).
 */
export async function getExecutionByCommunity(communityId: string): Promise<ExecutionState | null> {
  const all = await getAllActiveStates();
  return all.find(s => s.communityId === communityId && !s.completed) ?? null;
}

/**
 * Returns ALL active (non-completed) execution states for a community.
 * Used to determine queue position when accepting new offers.
 */
export async function getActiveExecutionsByCommunity(communityId: string): Promise<ExecutionState[]> {
  const all = await getAllActiveStates();
  return all.filter(s => s.communityId === communityId && !s.completed);
}

/**
 * Restore all active execution timers on bot restart.
 */
export async function restoreActiveExecutions(bot?: Telegraf): Promise<void> {
  try {
    const states = await getAllActiveStates();
    console.log(`Found ${states.length} active executions to restore`);

    for (const state of states) {
      if (state.completed) continue;
      if (!bot) continue;

      const now = Date.now();

      // Restore completion-check timer (always, regardless of queue)
      const checkAt = new Date(state.nextCheckAt).getTime();
      if (checkAt <= now) {
        checkAndFinalize(bot, state).catch(console.error);
      } else {
        scheduleAt(state.executionId, state.nextCheckAt, () => checkAndFinalize(bot, state));
      }

      // If execution is still queued (hasn't started yet), restore deferred start timer
      if (state.startAt) {
        const startMs = new Date(state.startAt).getTime();
        if (startMs > now) {
          const delayMs = startMs - now;
          const handle = setTimeout(async () => {
            try { await _doStartExecution(bot, state); } catch (err) {
              console.error('[Shilling] Restored deferred start failed:', err);
            }
          }, delayMs);
          adTimers.set(state.executionId, [handle]);
        } else {
          // Should have started while bot was down — start now
          _doStartExecution(bot, state).catch(console.error);
        }
        continue; // Ad timers will be set when _doStartExecution runs
      }

      // Restore pending ad posts (skip already-posted ones)
      if (state.adSchedule?.length > 0 && state.promoteContent) {
        const adText = buildAdContent(state.promoteContent);
        const postedCount = state.actions.filter(a => a.type === 'group_ad').length;
        const pendingSchedule = state.adSchedule.slice(postedCount);
        if (pendingSchedule.length > 0 && adText) {
          scheduleAdPosts(bot, { ...state, adSchedule: pendingSchedule }, adText, postedCount);
        }
      }
    }
  } catch (err) {
    console.error('Error restoring active executions:', err);
  }
}

// ==================== Bot command handlers ====================

export function registerShillingHandlers(bot: Telegraf): void {

  // /pin <message> — Bot sends + pins the message, records action
  bot.command('pin', async (ctx) => {
    const text = (ctx.message as any)?.text ?? '';
    const content = text.replace('/pin', '').trim();

    if (!content) {
      await ctx.reply('Usage: /pin <message text>\nExample: /pin 🚀 Check out this amazing project!');
      return;
    }

    try {
      const sent = await ctx.reply(content);
      await ctx.pinChatMessage(sent.message_id);

      // Find active execution for this community (by chatId)
      const chatId = ctx.chat?.id;
      const all = await getAllActiveStates();
      const exec = all.find(s => String(s.chatId) === String(chatId));
      if (exec) await recordPinned(exec.executionId, sent.message_id);

      await ctx.reply('📌 Post pinned and recorded.');
    } catch {
      await ctx.reply('❌ Could not pin message. Make sure I have pin permissions.');
    }
  });

  // /ad <message> — Bot sends ad post, records action
  bot.command('ad', async (ctx) => {
    const text = (ctx.message as any)?.text ?? '';
    const content = text.replace('/ad', '').trim();

    if (!content) {
      await ctx.reply('Usage: /ad <message text>\nExample: /ad 📢 New DeFi protocol launching soon!');
      return;
    }

    try {
      const sent = await ctx.reply(content);

      const chatId = ctx.chat?.id;
      const all = await getAllActiveStates();
      const exec = all.find(s => String(s.chatId) === String(chatId));
      if (exec) await recordAd(exec.executionId, sent.message_id);

      await ctx.reply(`✅ Ad posted and recorded. (${exec ? `${exec.actions.filter(a => a.type === 'group_ad').length + 1}/${exec.requirements.groupAds}` : '?'} ads done)`);
    } catch {
      await ctx.reply('❌ Failed to send ad.');
    }
  });

  // Detect when a message gets pinned by anyone (catches manual pins by admin)
  bot.on('message', async (ctx) => {
    const msg = ctx.message as any;
    if (!msg?.pinned_message) return;

    const chatId = ctx.chat?.id;
    const all = await getAllActiveStates();
    const exec = all.find(s => String(s.chatId) === String(chatId));
    if (exec && !exec.pinnedAt) {
      await recordPinned(exec.executionId, msg.pinned_message.message_id);
    }
  });
}
