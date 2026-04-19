// Custom types extending Prisma client
export interface CampaignConfig {
  duration: '1d' | '1w' | '1m';
  communityCount: 10 | 30 | 50;
  language: ('zh' | 'ko')[];
  projectInfo: {
    name: string;
    website: string;
    contractAddress?: string;
    description: string;
  };
}

export interface CampaignPaymentData {
  totalAmount: string;
  platformFee: string;
  caReward: string;
  vaultAddress?: string;
  status: 'pending' | 'paid' | 'released' | 'refunded';
  paidAt?: Date;
}

export interface ShillingTask {
  duration: '1d' | '1w' | '1m';
  requirements: {
    pinnedPost: boolean;
    groupAds: number;
    discussions: number;
  };
  projectInfo: {
    name: string;
    website: string;
    description: string;
    adContent: string;
    discussionTopics: string[];
  };
}

export interface OfferReward {
  amount: string;
  paymentMethod: 'x402' | 'direct';
}
