import { calculatePricing, calculateDisplayPricing, formatAmount, parseAmount } from '@ms/utils';

// ==================== calculatePricing (test/on-chain amounts) ====================

describe('calculatePricing', () => {
  describe('returns correct split for testnet values', () => {
    it('1w / 10 communities → total=4 USDT, fee=30% of total, reward=70% of total', () => {
      const result = calculatePricing('1w', 10);
      expect(result.total).toBe('4000000');
      expect(result.platformFee).toBe('1200000');  // 4 × 30% = 1.2 USDT
      expect(result.caReward).toBe('2800000');     // 4 × 70% = 2.8 USDT
    });

    it('1w / 30 communities → total=5 USDT', () => {
      const result = calculatePricing('1w', 30);
      expect(result.total).toBe('5000000');
    });

    it('4w / 50 communities → total=14 USDT', () => {
      const result = calculatePricing('4w', 50);
      expect(result.total).toBe('14000000');
    });
  });

  describe('fee + reward = total (no rounding loss)', () => {
    const cases: Array<['1w' | '2w' | '4w', 10 | 30 | 50]> = [
      ['1w', 10], ['1w', 30], ['1w', 50],
      ['2w', 10], ['2w', 30], ['2w', 50],
      ['4w', 10], ['4w', 30], ['4w', 50],
    ];

    it.each(cases)('%s / %d: fee + reward == total', (duration, count) => {
      const result = calculatePricing(duration, count);
      const total = BigInt(result.total);
      const fee = BigInt(result.platformFee);
      const reward = BigInt(result.caReward);
      expect(fee + reward).toBe(total);
    });
  });

  describe('returns strings (not bigints)', () => {
    it('all return values are strings', () => {
      const result = calculatePricing('1w', 10);
      expect(typeof result.total).toBe('string');
      expect(typeof result.platformFee).toBe('string');
      expect(typeof result.caReward).toBe('string');
    });
  });
});

// ==================== calculateDisplayPricing (production display amounts) ====================
// Formula: platformFee = communityCharge × 30%, total = communityCharge + platformFee

describe('calculateDisplayPricing', () => {
  it('Package A / 10 communities → communityCharge=$2000, fee=$600, total=$2600', () => {
    const r = calculateDisplayPricing('A', 10);
    expect(r.communityCharge).toBe(2000);
    expect(r.platformFee).toBe(600);   // 2000 × 30%
    expect(r.total).toBe(2600);        // 2000 + 600
  });

  it('Package B / 10 communities → communityCharge=$3000, fee=$900, total=$3900', () => {
    const r = calculateDisplayPricing('B', 10);
    expect(r.communityCharge).toBe(3000);
    expect(r.platformFee).toBe(900);
    expect(r.total).toBe(3900);
  });

  it('Package C / 30 communities → communityCharge=$18000, fee=$5400, total=$23400', () => {
    const r = calculateDisplayPricing('C', 30);
    expect(r.communityCharge).toBe(18000);
    expect(r.platformFee).toBe(5400);
    expect(r.total).toBe(23400);
  });

  it('Package D / 50 communities → communityCharge=$60000, fee=$18000, total=$78000', () => {
    const r = calculateDisplayPricing('D', 50);
    expect(r.communityCharge).toBe(60000);
    expect(r.platformFee).toBe(18000);
    expect(r.total).toBe(78000);
  });

  it('platformFee is exactly 30% of communityCharge for all packages', () => {
    for (const pkg of ['A', 'B', 'C', 'D'] as const) {
      for (const count of [1, 10, 30, 50]) {
        const r = calculateDisplayPricing(pkg, count);
        expect(r.platformFee).toBe(Math.round(r.communityCharge * 0.3));
      }
    }
  });

  it('total = communityCharge + platformFee', () => {
    for (const pkg of ['A', 'B', 'C', 'D'] as const) {
      const r = calculateDisplayPricing(pkg, 10);
      expect(r.total).toBe(r.communityCharge + r.platformFee);
    }
  });
});

// ==================== formatAmount / parseAmount ====================

describe('formatAmount', () => {
  it('formats 1 USDT (6 decimals)', () => {
    expect(formatAmount('1000000')).toBe('1');
  });

  it('formats 1.5 USDT', () => {
    expect(formatAmount('1500000')).toBe('1.5');
  });

  it('formats 0', () => {
    expect(formatAmount('0')).toBe('0');
  });

  it('accepts bigint input', () => {
    expect(formatAmount(1000000n)).toBe('1');
  });

  it('trims trailing zeros in fractional part', () => {
    expect(formatAmount('1100000')).toBe('1.1');
  });
});

describe('parseAmount', () => {
  it('parses "1" → "1000000"', () => {
    expect(parseAmount('1')).toBe('1000000');
  });

  it('parses "1.5" → "1500000"', () => {
    expect(parseAmount('1.5')).toBe('1500000');
  });

  it('parses "0" → "0"', () => {
    expect(parseAmount('0')).toBe('0');
  });

  it('round-trips with formatAmount', () => {
    const original = '2500000';
    expect(parseAmount(formatAmount(original))).toBe(original);
  });
});
