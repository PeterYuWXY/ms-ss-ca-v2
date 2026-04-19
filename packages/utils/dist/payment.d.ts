export declare function formatAmount(amount: string | bigint, decimals?: number): string;
export declare function parseAmount(amount: string, decimals?: number): string;
export declare function calculatePricing(duration: '1d' | '1w' | '1m', communityCount: 10 | 30 | 50): {
    total: string;
    platformFee: string;
    caReward: string;
};
