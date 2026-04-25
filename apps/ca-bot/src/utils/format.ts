export function escapeMd(text: string): string {
  return text.replace(/[_*`[]/g, '\\$&');
}

export function formatPrice(price: number): string {
  if (!price || isNaN(price)) return '$0';
  if (price >= 10000) return '$' + Math.round(price).toLocaleString('en-US');
  if (price >= 1) return `$${price.toFixed(2)}`;
  const mag = Math.floor(Math.log10(price));
  const decimals = Math.min(Math.abs(mag) + 2, 12);
  return `$${price.toFixed(decimals)}`;
}

export function formatBigNum(n: number): string {
  if (!n || isNaN(n)) return 'N/A';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

export function formatChange(pct: number): string {
  const arrow = pct >= 0 ? '📈' : '📉';
  const sign = pct >= 0 ? '+' : '';
  return `${arrow} ${sign}${pct.toFixed(2)}%`;
}

/**
 * Returns the nearest psychological round-number support and resistance levels.
 * Uses the half-magnitude grid (e.g. for ETH $3180: levels at $500 intervals).
 */
export function getKeyLevels(price: number): { support: number[]; resistance: number[] } {
  if (!price || price <= 0) return { support: [], resistance: [] };
  const mag = Math.pow(10, Math.floor(Math.log10(price)));
  const step = mag / 2;
  const base = Math.floor(price / step) * step;

  const levels: number[] = [];
  for (let i = -4; i <= 5; i++) levels.push(base + i * step);

  const support    = levels.filter(l => l < price * 0.999).slice(-2).reverse();
  const resistance = levels.filter(l => l > price * 1.001).slice(0, 2);
  return { support, resistance };
}

export function getWeekId(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}
