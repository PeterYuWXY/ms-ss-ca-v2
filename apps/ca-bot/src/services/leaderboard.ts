import { Redis } from 'ioredis';
import type { Telegraf } from 'telegraf';
import { getWeekId } from '../utils/format.js';
import { t, type Lang } from '../i18n/index.js';
import { getRegisteredGroups } from './briefing.js';

const redis = new Redis({
  host:      process.env.REDIS_HOST     ?? 'localhost',
  port:      parseInt(process.env.REDIS_PORT ?? '6379'),
  password:  process.env.REDIS_PASSWORD,
  keyPrefix: 'ca-bot:lb:',
  lazyConnect: true,
});
redis.on('error', (err) => console.warn('[Leaderboard Redis]', err.message));

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Called each time a group member uses the token lookup feature.
 * Increments the community's weekly score and caches the display name.
 */
export async function incrementActivity(chatId: string | number, communityName: string): Promise<void> {
  const week = getWeekId();
  const cid  = String(chatId);
  try {
    await redis.zincrby(`week:${week}`, 1, cid);
    // Store community name separately so we can display it in the leaderboard
    await redis.set(`name:${cid}`, communityName, 'EX', 60 * 60 * 24 * 14); // 14-day TTL
  } catch { /* Redis unavailable — skip silently */ }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

interface LeaderEntry { rank: number; name: string; chatId: string; score: number }

export async function getWeeklyLeaderboard(topN = 10): Promise<LeaderEntry[]> {
  const week = getWeekId();
  try {
    // Returns [member, score, member, score, ...]
    const raw = await redis.zrevrange(`week:${week}`, 0, topN - 1, 'WITHSCORES');
    const entries: LeaderEntry[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const chatId = raw[i];
      const score  = parseInt(raw[i + 1], 10);
      const name   = (await redis.get(`name:${chatId}`)) ?? chatId;
      entries.push({ rank: entries.length + 1, name, chatId, score });
    }
    return entries;
  } catch {
    return [];
  }
}

export async function getTotalQueriesThisWeek(): Promise<number> {
  const week = getWeekId();
  try {
    const all = await redis.zrange(`week:${week}`, 0, -1, 'WITHSCORES');
    let total = 0;
    for (let i = 1; i < all.length; i += 2) total += parseInt(all[i], 10);
    return total;
  } catch {
    return 0;
  }
}

// ─── Message builder ──────────────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];

export function buildLeaderboardMessage(
  entries: LeaderEntry[],
  total: number,
  weekId: string,
  lang: Lang,
  botname: string,
): string {
  const weekNum = weekId.split('-W')[1] ?? weekId;
  const weekLabel = t(lang, 'lb.week', { week: weekNum });

  if (entries.length === 0) {
    return (
      `${t(lang, 'lb.title')}\n` +
      `_${weekLabel}_\n\n` +
      t(lang, 'lb.empty') + '\n\n' +
      t(lang, 'lb.join') + '\n' +
      t(lang, 'lb.powered', { botname })
    );
  }

  const lines = entries.map(e => {
    const medal  = MEDALS[e.rank - 1] ?? `${e.rank}.`;
    const nameStr = e.name.length > 22 ? e.name.slice(0, 21) + '…' : e.name;
    return `${medal} ${nameStr.padEnd(23)} ${e.score.toLocaleString('en-US')} ${t(lang, 'lb.queries')}`;
  }).join('\n');

  return (
    `${t(lang, 'lb.title')}\n` +
    `_${weekLabel}_\n\n` +
    `\`${lines}\`\n\n` +
    t(lang, 'lb.total', { total: total.toLocaleString('en-US') }) + '\n\n' +
    t(lang, 'lb.join') + '\n' +
    t(lang, 'lb.powered', { botname })
  );
}

// ─── Broadcaster ──────────────────────────────────────────────────────────────

export async function broadcastLeaderboard(bot: Telegraf): Promise<void> {
  const botname = (await bot.telegram.getMe().catch(() => ({ username: 'MSCommunityAgent_bot' }))).username ?? 'MSCommunityAgent_bot';
  const week    = getWeekId();
  const entries = await getWeeklyLeaderboard(10);
  const total   = await getTotalQueriesThisWeek();
  const groups  = await getRegisteredGroups();

  console.log(`[Leaderboard] Broadcasting to ${groups.length} groups`);

  const msgCache: Partial<Record<Lang, string>> = {};

  for (const { chatId, lang } of groups) {
    if (!msgCache[lang]) {
      msgCache[lang] = buildLeaderboardMessage(entries, total, week, lang, botname);
    }
    try {
      await bot.telegram.sendMessage(chatId, msgCache[lang]!, { parse_mode: 'Markdown' });
      await sleep(60);
    } catch (err: any) {
      console.warn(`[Leaderboard] Failed to send to ${chatId}:`, err?.description ?? err?.message);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
