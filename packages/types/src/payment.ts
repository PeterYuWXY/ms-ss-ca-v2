export interface CampaignPayment {
  id: string;
  campaignId: string;
  totalAmount: string;
  platformFee: string;
  caReward: string;
  vaultAddress?: string;
  status: PaymentStatus;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExecutionPayment {
  id: string;
  executionId: string;
  amount: string;
  status: PaymentStatus;
  txHash?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentStatus = 'pending' | 'paid' | 'released' | 'refunded';

export interface PricingTier {
  duration: '1d' | '1w' | '1m';
  communityCount: 10 | 30 | 50;
  price: string;
  platformFee: string;
  caReward: string;
}
