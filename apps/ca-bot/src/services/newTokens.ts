import axios from 'axios';
import type { Telegraf } from 'telegraf';
import { formatChange, formatBigNum } from '../utils/format.js';
import { t, type Lang } from '../i18n/index.js';
import { getRegisteredGroups } from './briefing.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrendingToken {
  name: string;
  symbol: string;
  change24h: number;
  marketCap: string;
  rank: number;
}

// ─── DexScreener boosted tokens ───────────────────────────────────────────────
// Uses DexScreener's "top boosted" endpoint — tokens with highest paid boost,
// enriched with live price/change data from the search endpoint.

export async function fetchTrendingTokens(): Promise<TrendingToken[]> {
  // Step 1: fetch top boosted tokens
  const boostsRes = await axios.get(
    'https://api.dexscreener.com/token-boosts/top/v1',
    { timeout: 10000 },
  );
  const boosts: any[] = Array.isArray(boostsRes.data) ? boostsRes.data : [];

  // Deduplicate by chainId:tokenAddress
  const seen = new Set<string>();
  const candidates = boosts
    .filter(b => b.tokenAddress && b.chainId)
    .filter(b => {
      const key = `${b.chainId}:${b.tokenAddress.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12); // fetch up to 12 to get 7 valid results

  // Step 2: enrich each with price data from DexScreener search
  const results: TrendingToken[] = [];

  for (const boost of candidates) {
    if (results.length >= 7) break;
    try {
      const searchRes = await axios.get(
        `https://api.dexscreener.com/latest/dex/search?q=${boost.tokenAddress}`,
        { timeout: 8000 },
      );
      const pairs: any[] = searchRes.data?.pairs ?? [];
      if (pairs.length === 0) continue;

      // Prefer pairs on the same chain, sorted by liquidity
      const samChain = pairs.filter(p => p.chainId === boost.chainId);
      const pool = (samChain.length > 0 ? samChain : pairs)
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];

      if (!pool) continue;

      results.push({
        name:      pool.baseToken.name,
        symbol:    pool.baseToken.symbol?.toUpperCase() ?? '?',
        change24h: pool.priceChange?.h24 ?? 0,
        marketCap: formatBigNum(pool.marketCap ?? pool.fdv ?? 0),
        rank:      results.length + 1,
      });

      await sleep(120); // stay well within DexScreener rate limits
    } catch { /* skip this token on any error */ }
  }

  return results;
}

// ─── Message builder ──────────────────────────────────────────────────────────

export function buildRadarMessage(tokens: TrendingToken[], lang: Lang, botname: string): string {
  if (tokens.length === 0) return '';

  const lines = tokens.map(tok =>
    `${tok.rank}. *${tok.symbol}*  ${formatChange(tok.change24h)}  ${tok.marketCap}`
  ).join('\n');

  return (
    `${t(lang, 'radar.title')}\n\n` +
    lines + '\n\n' +
    `${t(lang, 'radar.tip')}\n` +
    t(lang, 'radar.powered', { botname })
  );
}

// ─── Broadcaster ──────────────────────────────────────────────────────────────

export async function broadcastRadar(bot: Telegraf): Promise<void> {
  const botname = (await bot.telegram.getMe().catch(() => ({ username: 'MSCommunityAgent_bot' }))).username ?? 'MSCommunityAgent_bot';

  let tokens: TrendingToken[];
  try {
    tokens = await fetchTrendingTokens();
  } catch (err) {
    console.error('[Radar] Failed to fetch trending tokens:', err);
    return;
  }
  if (tokens.length === 0) return;

  const groups = await getRegisteredGroups();
  console.log(`[Radar] Broadcasting to ${groups.length} groups`);

  const msgCache: Partial<Record<Lang, string>> = {};

  for (const { chatId, lang } of groups) {
    if (!msgCache[lang]) {
      msgCache[lang] = buildRadarMessage(tokens, lang, botname);
    }
    const msg = msgCache[lang];
    if (!msg) continue;
    try {
      await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      await sleep(60);
    } catch (err: any) {
      console.warn(`[Radar] Failed to send to ${chatId}:`, err?.description ?? err?.message);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
