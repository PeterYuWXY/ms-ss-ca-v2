export interface Skill {
  id: string;
  name: string;
  version: string;
  description: string;
  category: 'shilling' | 'seo' | 'kol' | 'content';
  config: SkillConfig;
  stats: SkillStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillConfig {
  durations: ('1d' | '1w' | '1m')[];
  communityCounts: (10 | 30 | 50)[];
  languages: ('zh' | 'ko')[];
}

export interface SkillStats {
  totalCalls: number;
  activeCampaigns: number;
  avgConversionRate: number;
  totalRevenue: string;
}
