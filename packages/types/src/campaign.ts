export interface Campaign {
  id: string;
  advertiserId: string;
  advertiserWallet: string;
  skillId: string;
  config: CampaignConfig;
  status: CampaignStatus;
  timeline: CampaignTimeline;
  performance: CampaignPerformance;
  createdAt: Date;
  updatedAt: Date;
}

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

export type CampaignStatus = 'draft' | 'pending' | 'active' | 'completed' | 'cancelled';

export interface CampaignTimeline {
  createdAt: Date;
  paidAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface CampaignPerformance {
  totalReach: number;
  totalClicks: number;
  conversionRate: number;
  costPerClick: number;
}

export interface CampaignExecution {
  id: string;
  campaignId: string;
  communityId: string;
  caId: string;
  status: ExecutionStatus;
  shillingData: ShillingData;
  createdAt: Date;
  updatedAt: Date;
}

export type ExecutionStatus = 'pending' | 'accepted' | 'rejected' | 'executing' | 'completed';

export interface ShillingData {
  pinnedPost?: {
    messageId: string;
    postedAt: Date;
    screenshotUrl: string;
  };
  groupAds: Array<{
    messageId: string;
    postedAt: Date;
    content: string;
  }>;
  discussions: Array<{
    messageId: string;
    postedAt: Date;
    initiatedBy: string;
  }>;
}
