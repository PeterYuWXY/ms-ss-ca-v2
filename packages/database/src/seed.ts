import { PrismaClient, SkillCategory, Platform, CommunityStatus, CAStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create Shilling Skill
  const shillingSkill = await prisma.skill.upsert({
    where: { id: 'shilling-skill' },
    update: {},
    create: {
      id: 'shilling-skill',
      name: 'Shilling Skill',
      version: '1.0.0',
      description: 'Standardized community promotion service including pinned posts, group ads, and discussion initiation.',
      category: SkillCategory.shilling,
      config: {
        durations: ['1d', '1w', '1m'],
        communityCounts: [10, 30, 50],
        languages: ['zh', 'ko'],
        requirements: {
          pinnedPost: true,
          groupAds: 3,
          discussions: 2
        }
      },
      stats: {
        totalCalls: 0,
        activeCampaigns: 0,
        avgConversionRate: 0,
        totalRevenue: '0'
      }
    }
  });
  console.log('✅ Created Shilling Skill:', shillingSkill.id);

  // Create sample communities
  const communities = [
    {
      id: 'community-1',
      name: 'Crypto Alpha Chinese',
      platform: Platform.telegram,
      language: ['zh'],
      memberCount: 5000,
      category: 'DeFi',
      tags: ['crypto', 'defi', 'chinese'],
      rankings: { byMembers: 1, byActivity: 2, byRating: 1 },
      activity: { dailyMessages: 150, activeUsers7d: 1200, growthRate: 5.2 },
      ownerWallet: '0x1234567890123456789012345678901234567890',
      status: CommunityStatus.active
    },
    {
      id: 'community-2',
      name: 'Korean Crypto Hub',
      platform: Platform.telegram,
      language: ['ko'],
      memberCount: 3200,
      category: 'NFT',
      tags: ['crypto', 'nft', 'korean'],
      rankings: { byMembers: 2, byActivity: 1, byRating: 2 },
      activity: { dailyMessages: 200, activeUsers7d: 800, growthRate: 8.5 },
      ownerWallet: '0x2345678901234567890123456789012345678901',
      status: CommunityStatus.active
    },
    {
      id: 'community-3',
      name: 'Web3 Builders',
      platform: Platform.telegram,
      language: ['zh', 'ko'],
      memberCount: 8900,
      category: 'General',
      tags: ['web3', 'builders', 'general'],
      rankings: { byMembers: 1, byActivity: 3, byRating: 1 },
      activity: { dailyMessages: 300, activeUsers7d: 2500, growthRate: 12.3 },
      ownerWallet: '0x3456789012345678901234567890123456789012',
      status: CommunityStatus.active
    },
    {
      id: 'community-4',
      name: 'DeFi Yield Farmers',
      platform: Platform.telegram,
      language: ['zh'],
      memberCount: 4500,
      category: 'DeFi',
      tags: ['defi', 'yield', 'farming'],
      rankings: { byMembers: 3, byActivity: 4, byRating: 3 },
      activity: { dailyMessages: 100, activeUsers7d: 900, growthRate: 3.1 },
      ownerWallet: '0x4567890123456789012345678901234567890123',
      status: CommunityStatus.active
    },
    {
      id: 'community-5',
      name: 'NFT Collectors Korea',
      platform: Platform.telegram,
      language: ['ko'],
      memberCount: 2800,
      category: 'NFT',
      tags: ['nft', 'collectors', 'korean'],
      rankings: { byMembers: 4, byActivity: 5, byRating: 4 },
      activity: { dailyMessages: 80, activeUsers7d: 600, growthRate: 2.5 },
      ownerWallet: '0x5678901234567890123456789012345678901234',
      status: CommunityStatus.active
    }
  ];

  for (const community of communities) {
    await prisma.community.upsert({
      where: { id: community.id },
      update: {},
      create: community
    });
    console.log('✅ Created Community:', community.name);
  }

  // Create sample Community Agents
  const agents = [
    {
      id: 'ca-1',
      botId: 'bot_abc123',
      ownerWallet: '0x1234567890123456789012345678901234567890',
      name: 'Crypto Alpha CA',
      reputation: { score: 95, completedTasks: 45, rating: 4.8 },
      status: CAStatus.active
    },
    {
      id: 'ca-2',
      botId: 'bot_def456',
      ownerWallet: '0x2345678901234567890123456789012345678901',
      name: 'Korean Hub CA',
      reputation: { score: 88, completedTasks: 32, rating: 4.5 },
      status: CAStatus.active
    },
    {
      id: 'ca-3',
      botId: 'bot_ghi789',
      ownerWallet: '0x3456789012345678901234567890123456789012',
      name: 'Web3 Builders CA',
      reputation: { score: 92, completedTasks: 67, rating: 4.7 },
      status: CAStatus.active
    }
  ];

  for (const agent of agents) {
    await prisma.communityAgent.upsert({
      where: { id: agent.id },
      update: {},
      create: agent
    });
    console.log('✅ Created Community Agent:', agent.name);
  }

  // Create sample Advertiser
  const advertiser = await prisma.advertiser.upsert({
    where: { id: 'adv-1' },
    update: {},
    create: {
      id: 'adv-1',
      walletAddress: '0x9876543210987654321098765432109876543210',
      name: 'DeFi Protocol X',
      email: 'marketing@defiprotocol.com',
      totalSpent: '0'
    }
  });
  console.log('✅ Created Advertiser:', advertiser.name);

  console.log('\n🎉 Database seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
