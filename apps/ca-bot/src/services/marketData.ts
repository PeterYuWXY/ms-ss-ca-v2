import axios from 'axios';
import { formatPrice, formatBigNum, formatChange, getKeyLevels, escapeMd } from '../utils/format.js';
import { t, type Lang } from '../i18n/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenInfo {
  name: string;
  symbol: string;
  address: string;
  chainId: string;   // e.g. 'bsc', 'ethereum'
  dexId: string;     // e.g. 'pancakeswap', 'uniswap'
  priceUsd: number;
  priceChange24h: number;
  marketCap: number;
  fdv: number;
  volume24h: number;
  liquidity: number;
  txnsBuys24h: number;
  txnsSells24h: number;
  url: string;
}

export interface SecurityInfo {
  isHoneypot: boolean;
  isRisky: boolean;
  buyTax: number;
  sellTax: number;
  holderCount: number;
}

// DexScreener chainId → GoPlus security API chainId
const GOPLUS_CHAIN: Record<string, string> = {
  ethereum:  '1',
  bsc:       '56',
  polygon:   '137',
  arbitrum:  '42161',
  optimism:  '10',
  base:      '8453',
  avalanche: '43114',
  fantom:    '250',
};

// Human-readable chain names
const CHAIN_NAME: Record<string, string> = {
  ethereum:  'ETH',
  bsc:       'BSC',
  polygon:   'Polygon',
  arbitrum:  'Arbitrum',
  optimism:  'Optimism',
  base:      'Base',
  avalanche: 'AVAX',
  solana:    'SOL',
  fantom:    'FTM',
};

// ─── DexScreener token lookup ─────────────────────────────────────────────────

export async function fetchTokenData(query: string): Promise<TokenInfo | null> {
  try {
    const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`;
    const res = await axios.get(url, { timeout: 10000 });
    const pairs: any[] = res.data?.pairs ?? [];
    if (pairs.length === 0) return null;

    // Pick the pair with highest liquidity
    const best = pairs.reduce((a, b) =>
      (b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a
    );

    return {
      name:          best.baseToken.name,
      symbol:        best.baseToken.symbol,
      address:       best.baseToken.address,
      chainId:       best.chainId,
      dexId:         best.dexId,
      priceUsd:      parseFloat(best.priceUsd ?? '0'),
      priceChange24h: best.priceChange?.h24 ?? 0,
      marketCap:     best.marketCap ?? 0,
      fdv:           best.fdv ?? 0,
      volume24h:     best.volume?.h24 ?? 0,
      liquidity:     best.liquidity?.usd ?? 0,
      txnsBuys24h:   best.txns?.h24?.buys ?? 0,
      txnsSells24h:  best.txns?.h24?.sells ?? 0,
      url:           best.url,
    };
  } catch {
    return null;
  }
}

// ─── GoPlus security check ────────────────────────────────────────────────────

export async function fetchSecurityData(chainId: string, address: string): Promise<SecurityInfo | null> {
  const goplusChain = GOPLUS_CHAIN[chainId];
  if (!goplusChain) return null;

  try {
    const url = `https://api.gopluslabs.io/api/v1/token_security/${goplusChain}?contract_addresses=${address}`;
    const res  = await axios.get(url, { timeout: 8000 });
    const data = res.data?.result?.[address.toLowerCase()];
    if (!data) return null;

    const buyTax  = parseFloat(data.buy_tax  ?? '0') * 100;
    const sellTax = parseFloat(data.sell_tax ?? '0') * 100;
    const isHoneypot = data.is_honeypot === '1';
    const isRisky    = isHoneypot || buyTax > 10 || sellTax > 10 || data.is_mintable === '1';

    return {
      isHoneypot,
      isRisky,
      buyTax,
      sellTax,
      holderCount: parseInt(data.holder_count ?? '0'),
    };
  } catch {
    return null;
  }
}

// ─── Message builder ──────────────────────────────────────────────────────────

export function buildTokenMessage(token: TokenInfo, sec: SecurityInfo | null, lang: Lang): string {
  const chain = CHAIN_NAME[token.chainId] ?? token.chainId.toUpperCase();
  const dex   = token.dexId.charAt(0).toUpperCase() + token.dexId.slice(1);

  const header   = t(lang, 'token.header', { symbol: token.symbol, dex, chain });
  const priceStr = formatPrice(token.priceUsd);
  const change   = formatChange(token.priceChange24h);

  // Security line
  let secLine = '';
  if (sec) {
    const label = sec.isHoneypot
      ? t(lang, 'token.honeypot')
      : sec.isRisky
        ? t(lang, 'token.risky')
        : t(lang, 'token.safe');
    const taxes = (sec.buyTax > 0 || sec.sellTax > 0)
      ? ` | ${t(lang, 'token.buyTax')}: ${sec.buyTax.toFixed(1)}% | ${t(lang, 'token.sellTax')}: ${sec.sellTax.toFixed(1)}%`
      : '';
    secLine = `\n${t(lang, 'token.security')}: ${label}${taxes}`;
    if (sec.holderCount > 0) {
      secLine += `\n${t(lang, 'token.holders')}: ${sec.holderCount.toLocaleString('en-US')}`;
    }
  } else {
    secLine = `\n${t(lang, 'token.security')}: ${t(lang, 'token.unknown')}`;
  }

  // Key price levels
  const { support, resistance } = getKeyLevels(token.priceUsd);
  const levelsLine = support.length > 0 && resistance.length > 0
    ? `\n${t(lang, 'token.support')}:     ${support.map(formatPrice).join(' / ')}\n` +
      `${t(lang, 'token.resistance')}:  ${resistance.map(formatPrice).join(' / ')}`
    : '';

  return (
    `${header}\n\n` +
    `${priceStr}  ${change}\n` +
    `${t(lang, 'token.mcap')}:  ${formatBigNum(token.marketCap)}\n` +
    `${t(lang, 'token.fdv')}:          ${formatBigNum(token.fdv)}\n` +
    `${t(lang, 'token.liquidity')}:   ${formatBigNum(token.liquidity)}\n` +
    `${t(lang, 'token.volume24h')}:    ${formatBigNum(token.volume24h)}\n` +
    `${t(lang, 'token.txns24h')}: ${(token.txnsBuys24h + token.txnsSells24h).toLocaleString('en-US')} ` +
    `(🟢 ${token.txnsBuys24h.toLocaleString('en-US')} / 🔴 ${token.txnsSells24h.toLocaleString('en-US')})\n` +
    secLine +
    levelsLine +
    `\n\n${escapeMd(t(lang, 'token.powered'))}`
  );
}

// ─── Community language cache ─────────────────────────────────────────────────

const langCache = new Map<string, { lang: string; expiry: number }>();

export async function getCommunityLang(chatId: string | number): Promise<Lang> {
  const key = String(chatId);
  const cached = langCache.get(key);
  if (cached && cached.expiry > Date.now()) return cached.lang as Lang;

  try {
    const MS_API_URL = process.env.MS_API_URL ?? 'http://localhost:3001';
    const res  = await axios.get(`${MS_API_URL}/api/v1/communities?caBotId=${chatId}`, { timeout: 5000 });
    const lang = (res.data?.data?.[0]?.language?.[0] ?? 'en') as Lang;
    langCache.set(key, { lang, expiry: Date.now() + 5 * 60 * 1000 });
    return lang;
  } catch {
    return 'en';
  }
}
