export interface Community {
  id: string;
  name: string;
  platform: 'telegram';
  language: ('zh' | 'ko')[];
  memberCount: number;
  category: string;
  tags: string[];
  rankings: CommunityRankings;
  activity: CommunityActivity;
  caBotId?: string;
  ownerWallet: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityRankings {
  byMembers: number;
  byActivity: number;
  byRating: number;
}

export interface CommunityActivity {
  dailyMessages: number;
  activeUsers7d: number;
  growthRate: number;
}

export interface CommunityFilters {
  language?: ('zh' | 'ko')[];
  minMembers?: number;
  category?: string;
  sortBy?: 'members' | 'activity' | 'rating';
}
