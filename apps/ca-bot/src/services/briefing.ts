import axios from 'axios';
import type { Telegraf } from 'telegraf';
import { formatChange, escapeMd } from '../utils/format.js';
import { t, type Lang } from '../i18n/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceEntry { symbol: string; price: number; change24h: number }
interface BriefingData {
  prices: PriceEntry[];
  fearGreed: { value: number; label: string };
  topGainers: { symbol: string; change24h: number }[];
}

// ─── Fear & Greed label key ────────────────────────────────────────────────────

function fearLevel(value: number): string {
  if (value <= 20) return 'briefing.fearLevel.0';
  if (value <= 40) return 'briefing.fearLevel.1';
  if (value <= 60) return 'briefing.fearLevel.2';
  if (value <= 80) return 'briefing.fearLevel.3';
  return 'briefing.fearLevel.4';
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

export async function fetchBriefingData(): Promise<BriefingData> {
  // Parallel: prices + fear&greed + gainers
  const [priceRes, fngRes, marketRes] = await Promise.allSettled([
    axios.get(
      'https://api.coingecko.com/api/v3/simple/price' +
      '?ids=bitcoin,ethereum,binancecoin,solana' +
      '&vs_currencies=usd&include_24hr_change=true',
      { timeout: 10000, headers: { Accept: 'application/json' } },
    ),
    axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 8000 }),
    axios.get(
      'https://api.coingecko.com/api/v3/coins/markets' +
      '?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false',
      { timeout: 12000, headers: { Accept: 'application/json' } },
    ),
  ]);

  // Prices
  const priceData = priceRes.status === 'fulfilled' ? priceRes.value.data : {};
  const MAJORS = [
    { id: 'bitcoin',     symbol: 'BTC' },
    { id: 'ethereum',    symbol: 'ETH' },
    { id: 'binancecoin', symbol: 'BNB' },
    { id: 'solana',      symbol: 'SOL' },
  ];
  const prices: PriceEntry[] = MAJORS
    .filter(m => priceData[m.id])
    .map(m => ({
      symbol:   m.symbol,
      price:    priceData[m.id].usd,
      change24h: priceData[m.id].usd_24h_change ?? 0,
    }));

  // Fear & Greed
  const fngValue = fngRes.status === 'fulfilled'
    ? parseInt(fngRes.value.data?.data?.[0]?.value ?? '50')
    : 50;
  const fearGreed = { value: fngValue, label: '' };

  // Top gainers from top-100 by market cap
  let topGainers: { symbol: string; change24h: number }[] = [];
  if (marketRes.status === 'fulfilled') {
    const coins: any[] = marketRes.value.data ?? [];
    topGainers = [...coins]
      .sort((a, b) => (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0))
      .slice(0, 5)
      .map(c => ({ symbol: c.symbol.toUpperCase(), change24h: c.price_change_percentage_24h ?? 0 }));
  }

  return { prices, fearGreed, topGainers };
}

// ─── Message builder ──────────────────────────────────────────────────────────

export function buildBriefingMessage(data: BriefingData, lang: Lang, botname: string): string {
  const now = new Date();
  // Display in UTC+8
  const utc8 = new Date(now.getTime() + 8 * 3600 * 1000);
  const dateStr = utc8.toISOString().slice(0, 16).replace('T', ' ') + ' (UTC+8)';

  // Price lines — align columns
  const priceLines = data.prices.map(p => {
    const priceStr  = `$${p.price >= 1000 ? Math.round(p.price).toLocaleString('en-US') : p.price.toFixed(2)}`;
    const changeStr = formatChange(p.change24h);
    return `${p.symbol.padEnd(4)}  ${priceStr.padEnd(12)} ${changeStr}`;
  }).join('\n');

  // Fear & Greed line
  const fgKey   = fearLevel(data.fearGreed.value);
  const fgLabel = t(lang, fgKey);
  const fgLine  = `${t(lang, 'briefing.fearGreed')}: ${data.fearGreed.value} — ${fgLabel}`;

  // Top gainers
  const gainerLines = data.topGainers.length > 0
    ? '\n' + t(lang, 'briefing.topGainers') + '\n' +
      data.topGainers.map((g, i) =>
        `${i + 1}. ${g.symbol.padEnd(8)} ${formatChange(g.change24h)}`
      ).join('\n')
    : '';

  return (
    `${t(lang, 'briefing.title')}\n` +
    `_${escapeMd(dateStr)}_\n\n` +
    `\`${priceLines}\`\n\n` +
    fgLine +
    gainerLines +
    `\n\n${t(lang, 'briefing.tip')}\n` +
    t(lang, 'briefing.powered', { botname })
  );
}

// ─── Broadcaster ──────────────────────────────────────────────────────────────

export async function broadcastBriefing(bot: Telegraf): Promise<void> {
  const botname = (await bot.telegram.getMe().catch(() => ({ username: 'MSCommunityAgent_bot' }))).username ?? 'MSCommunityAgent_bot';

  let data: BriefingData;
  try {
    data = await fetchBriefingData();
  } catch (err) {
    console.error('[Briefing] Failed to fetch data:', err);
    return;
  }

  const groups = await getRegisteredGroups();
  console.log(`[Briefing] Broadcasting to ${groups.length} groups`);

  // Build one message per language to avoid duplicate API calls
  const msgCache: Partial<Record<Lang, string>> = {};

  for (const { chatId, lang } of groups) {
    if (!msgCache[lang]) {
      msgCache[lang] = buildBriefingMessage(data, lang, botname);
    }
    try {
      await bot.telegram.sendMessage(chatId, msgCache[lang]!, { parse_mode: 'Markdown' });
      await sleep(60); // ~16 groups/sec — within Telegram's 30 msg/sec limit
    } catch (err: any) {
      console.warn(`[Briefing] Failed to send to ${chatId}:`, err?.description ?? err?.message);
    }
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export async function getRegisteredGroups(): Promise<{ chatId: string; lang: Lang }[]> {
  try {
    const MS_API_URL = process.env.MS_API_URL ?? 'http://localhost:3001';
    const res = await axios.get(`${MS_API_URL}/api/v1/communities?limit=500`, { timeout: 10000 });
    const communities: any[] = res.data?.data ?? [];
    return communities
      .filter(c => c.caBotId)
      .map(c => ({
        chatId: String(c.caBotId),
        lang:   (c.language?.[0] ?? 'en') as Lang,
      }));
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
