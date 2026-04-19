export function formatAmount(amount: string | bigint, decimals = 6): string {
  const value = typeof amount === 'string' ? BigInt(amount) : amount;
  const divisor = BigInt(Math.pow(10, decimals));
  const integerPart = value / divisor;
  const fractionalPart = value % divisor;
  
  const fractional = fractionalPart.toString().padStart(decimals, '0');
  const trimmedFractional = fractional.replace(/0+$/, '');
  
  return trimmedFractional 
    ? `${integerPart}.${trimmedFractional}`
    : integerPart.toString();
}

export function parseAmount(amount: string, decimals = 6): string {
  const [integerPart, fractionalPart = ''] = amount.split('.');
  const paddedFractional = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
  const value = BigInt(integerPart) * BigInt(Math.pow(10, decimals)) + BigInt(paddedFractional);
  return value.toString();
}

// ==================== Promotion Packages ====================

export type PromotionPackage = 'A' | 'B' | 'C' | 'D';

/** Which campaign duration is locked to each package */
export const PACKAGE_DURATION: Record<PromotionPackage, '1w' | '2w' | '4w'> = {
  A: '1w', B: '1w', C: '2w', D: '4w',
};

/** Task requirements delivered by the CA Bot for each package */
export const PACKAGE_REQUIREMENTS: Record<PromotionPackage, {
  pinnedPost: boolean;
  pinDurationHours: number;
  groupAds: number;
  discussions: number;
}> = {
  A: { pinnedPost: false, pinDurationHours: 0,   groupAds: 3,  discussions: 3  },
  B: { pinnedPost: true,  pinDurationHours: 48,  groupAds: 3,  discussions: 3  },
  C: { pinnedPost: true,  pinDurationHours: 96,  groupAds: 6,  discussions: 6  },
  D: { pinnedPost: true,  pinDurationHours: 192, groupAds: 12, discussions: 12 },
};

// Production community-charge rates (USD, per community, excl. platform fee)
const DISPLAY_PRICE_PER_COMM: Record<PromotionPackage, number> = {
  A: 200,
  B: 300,
  C: 600,
  D: 1200,
};

/**
 * Production display pricing shown in the UI.
 *   communityCharge = pricePerComm × communityCount   (paid to communities — the base amount)
 *   platformFee     = communityCharge × 30%           (MS platform service fee)
 *   total           = communityCharge + platformFee   (= communityCharge × 1.3, what advertiser pays)
 */
export function calculateDisplayPricing(
  pkg: PromotionPackage,
  communityCount: number,
): { communityCharge: number; platformFee: number; total: number } {
  const communityCharge = DISPLAY_PRICE_PER_COMM[pkg] * communityCount;
  const platformFee     = Math.round(communityCharge * 0.3);
  const total           = communityCharge + platformFee;
  return { communityCharge, platformFee, total };
}

// ==================== On-chain test amounts (USDT, 6 decimals) ====================
// TESTNET MODE: small fixed amounts for local/BSC-Testnet testing.
// The UI shows production rates via calculateDisplayPricing(); these amounts are only
// used for the actual on-chain USDT transfer so test wallets don't need large balances.
//
// NOTE: The smart contract splits totalAmount as platformFee=30%, caReward=70%.
// This differs from the production formula (platformFee = communityCharge × 30%,
// total = communityCharge × 1.3). A contract BPS update (30/100 → 30/130) is
// required before mainnet launch to align on-chain amounts with display pricing.
const PRICING_TABLE: Record<'1w' | '2w' | '4w', Record<10 | 30 | 50, bigint>> = {
  '1w':  { 10: 4_000000n, 30: 5_000000n,  50: 6_000000n  },
  '2w':  { 10: 7_000000n, 30: 8_000000n,  50: 9_000000n  },
  '4w':  { 10: 10_000000n, 30: 12_000000n, 50: 14_000000n },
};

/**
 * Returns on-chain test payment amounts (6 decimal USDT bigint strings).
 * PRICING_TABLE value = total; platformFee = total×30%; caReward = total×70%.
 * Only used for contract interaction in test mode — UI uses calculateDisplayPricing().
 */
export function calculatePricing(
  duration: '1w' | '2w' | '4w',
  communityCount: 10 | 30 | 50
): { total: string; platformFee: string; caReward: string } {
  const total = PRICING_TABLE[duration][communityCount];
  const platformFee = (total * 30n) / 100n;
  const caReward = total - platformFee; // avoid rounding loss: caReward = total - fee

  return {
    total: total.toString(),
    platformFee: platformFee.toString(),
    caReward: caReward.toString(),
  };
}
