import { Router, Request, Response } from 'express';
import { prisma } from '@ms/database';
import { calculatePricing } from '@ms/utils';
import { matchCommunities, computeCommunityScore } from '../services/communityScoring.js';
type PricingDuration = '1w' | '2w' | '4w';

const router: Router = Router();

// GET /api/v1/campaigns - List campaigns
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, advertiserId } = req.query;

    // Sanitise pagination: clamp to valid positive integers
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const where: any = {};
    if (status) where.status = status;
    if (advertiserId) where.advertiserId = advertiserId;

    // Lean list query: omit deep community includes to avoid N+1
    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          payment: true,
          _count: { select: { communities: true } },
        },
      }),
      prisma.campaign.count({ where })
    ]);

    res.json({
      success: true,
      data: campaigns,
      pagination: {
        total,
        limit,
        offset,
        hasMore: total > offset + limit,
      }
    });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaigns'
    });
  }
});

// GET /api/v1/campaigns/:id - Get campaign by ID
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        skill: true,
        communities: {
          include: {
            community: true
          }
        },
        executions: {
          include: {
            community: true,
            ca: true
          }
        },
        payment: true
      }
    });
    
    if (!campaign) {
      res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
      return;
    }
    
    res.json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaign'
    });
  }
});

// Valid pricing keys
const VALID_DURATION_KEYS = ['1w', '2w', '4w'] as const;
const VALID_COMMUNITY_COUNTS = [10, 30, 50] as const;
type DurationKey = typeof VALID_DURATION_KEYS[number];
type CommunityCount = typeof VALID_COMMUNITY_COUNTS[number];

// POST /api/v1/campaigns - Create new campaign
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      campaignId,
      advertiser,
      advertiserId,
      advertiserWallet,
      objective,
      skillId,
      communities,
      selectedCommunities,
      filterTags,
      filterLanguages,
      duration,
      durationKey,
      communityCount,
      budget,
      totalAmount,
      chainId,
      platformFee,
      caReward,
      targetUrl,
      config
    } = req.body;

    // Server-side pricing validation when durationKey + communityCount are provided
    if (durationKey !== undefined && communityCount !== undefined) {
      if (!VALID_DURATION_KEYS.includes(durationKey as DurationKey)) {
        res.status(400).json({
          success: false,
          error: `Invalid durationKey: must be one of ${VALID_DURATION_KEYS.join(', ')}`,
        });
        return;
      }
      const countNum = Number(communityCount);
      if (!VALID_COMMUNITY_COUNTS.includes(countNum as CommunityCount)) {
        res.status(400).json({
          success: false,
          error: `Invalid communityCount: must be one of ${VALID_COMMUNITY_COUNTS.join(', ')}`,
        });
        return;
      }

      const expected = calculatePricing(durationKey as PricingDuration,countNum as CommunityCount);
      if (totalAmount !== undefined && String(totalAmount) !== expected.total) {
        res.status(400).json({
          success: false,
          error: `totalAmount mismatch: expected ${expected.total} for ${durationKey}/${communityCount} communities`,
        });
        return;
      }
    }

    // Use provided campaignId or generate one
    const newCampaignId = campaignId || `camp_${Date.now()}`;

    // ── Community resolution ───────────────────────────────────────────────
    // Priority: auto-matching via filterTags/filterLanguages (new flow)
    //           → falls back to explicit community list (legacy/test)
    const targetCount: number = Number.isFinite(Number(communityCount)) ? Number(communityCount) : 10;

    let resolvedCommunityIds: string[] = communities || selectedCommunities || [];
    if (resolvedCommunityIds.length === 0) {
      const matched = await matchCommunities({
        tags: Array.isArray(filterTags) ? filterTags : [],
        languages: Array.isArray(filterLanguages) ? filterLanguages : [],
        targetCount,
        overFactor: 1.5,
      });
      resolvedCommunityIds = matched.map((c) => c.id);
    }

    // Build config from frontend data if not provided
    const campaignConfig = config || {
      objective,
      duration,
      durationKey,
      communityCount,
      budget,
      chainId,
      ...(targetUrl ? { targetUrl } : {}),
    };
    // Always store filter params + targetCount in config for later use
    (campaignConfig as any).targetCommunityCount = targetCount;
    if (Array.isArray(filterTags)      && filterTags.length > 0)      (campaignConfig as any).filterTags      = filterTags;
    if (Array.isArray(filterLanguages) && filterLanguages.length > 0) (campaignConfig as any).filterLanguages = filterLanguages;

    // Create campaign
    const campaign = await prisma.campaign.create({
      data: {
        id: newCampaignId,
        advertiserId: advertiserId || advertiser,
        advertiserWallet: advertiserWallet || advertiser,
        skillId,
        config: campaignConfig,
        status: 'draft',
        timeline: {
          createdAt: new Date().toISOString()
        },
        performance: {
          totalReach: 0,
          totalClicks: 0,
          conversionRate: 0,
          costPerClick: 0
        },
        communities: {
          create: resolvedCommunityIds.map((communityId: string) => ({
            communityId,
            status: 'pending'
          }))
        }
      },
      include: {
        communities: {
          include: {
            community: true
          }
        }
      }
    });

    // Create payment record using server-validated amounts when available
    const resolvedPricing = (durationKey && communityCount)
      ? calculatePricing(durationKey as PricingDuration,Number(communityCount) as CommunityCount)
      : null;

    await prisma.campaignPayment.create({
      data: {
        campaignId: campaign.id,
        totalAmount: resolvedPricing?.total ?? String(totalAmount ?? budget ?? 0),
        platformFee: resolvedPricing?.platformFee ?? String(platformFee ?? 0),
        caReward: resolvedPricing?.caReward ?? String(caReward ?? 0),
        status: 'pending'
      }
    });
    
    res.status(201).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create campaign',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// PUT /api/v1/campaigns/:id - Update campaign
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, config } = req.body;
    
    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        status,
        config: config ? { ...config } : undefined
      }
    });
    
    res.json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update campaign'
    });
  }
});

// DELETE /api/v1/campaigns/:id - Delete campaign
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    await prisma.campaign.delete({
      where: { id }
    });
    
    res.json({
      success: true,
      message: 'Campaign deleted'
    });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete campaign'
    });
  }
});

// POST /api/v1/campaigns/:id/confirm-payment - Confirm payment on-chain
router.post('/:id/confirm-payment', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;
    
    if (!txHash) {
      res.status(400).json({
        success: false,
        error: 'Transaction hash is required'
      });
      return;
    }
    
    // Update campaign status to active
    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        status: 'active',
        timeline: {
          updatedAt: new Date().toISOString(),
          paidAt: new Date().toISOString(),
          txHash: txHash
        }
      }
    });
    
    // Update payment record
    await prisma.campaignPayment.update({
      where: { campaignId: id },
      data: {
        status: 'paid',
        paidAt: new Date()
      }
    });

    // Distribute offers to all communities in the campaign
    await distributeOffersForCampaign(id);

    res.json({
      success: true,
      data: campaign,
      message: 'Payment confirmed'
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to confirm payment'
    });
  }
});

// POST /api/v1/campaigns/:id/ratings - Submit community ratings
router.post('/:id/ratings', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { advertiserId, communityId, engagement, relevance, quality, speed, professionalism, comment } = req.body;

    if (!advertiserId || !communityId) {
      res.status(400).json({ success: false, error: 'advertiserId and communityId are required' });
      return;
    }

    const scores = [engagement, relevance, quality, speed, professionalism];
    if (scores.some(s => typeof s !== 'number' || s < 1 || s > 5)) {
      res.status(400).json({ success: false, error: 'All scores must be integers between 1 and 5' });
      return;
    }

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      res.status(404).json({ success: false, error: 'Campaign not found' });
      return;
    }
    if (campaign.status !== 'completed') {
      res.status(400).json({ success: false, error: 'Ratings can only be submitted for completed campaigns' });
      return;
    }

    const rating = await prisma.communityRating.upsert({
      where: { campaignId_communityId_advertiserId: { campaignId: id, communityId, advertiserId } },
      create: { campaignId: id, communityId, advertiserId, engagement, relevance, quality, speed, professionalism, comment },
      update: { engagement, relevance, quality, speed, professionalism, comment },
    });

    // Fire-and-forget: refresh community score + CA reputation
    refreshAfterRating(id, communityId).catch(() => {});

    res.json({ success: true, data: rating });
  } catch (error) {
    console.error('Error submitting rating:', error);
    res.status(500).json({ success: false, error: 'Failed to submit rating' });
  }
});

// GET /api/v1/campaigns/:id/ratings - Get ratings for a campaign
router.get('/:id/ratings', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const ratings = await prisma.communityRating.findMany({
      where: { campaignId: id },
    });
    res.json({ success: true, data: ratings });
  } catch (error) {
    console.error('Error fetching ratings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ratings' });
  }
});

// ==================== Post-rating score refresh ====================

async function refreshAfterRating(campaignId: string, communityId: string): Promise<void> {
  try {
    // 1. Refresh community scoreCache immediately
    const score = await computeCommunityScore(communityId);
    await prisma.community.update({ where: { id: communityId }, data: { scoreCache: score } });

    // 2. Find the CA who executed this community for this campaign
    const execution = await prisma.campaignExecution.findFirst({
      where: { campaignId, communityId },
      select: { caId: true },
    });
    if (!execution) return;

    // 3. All communities this CA has ever executed
    const caExecutions = await prisma.campaignExecution.findMany({
      where: { caId: execution.caId },
      select: { communityId: true },
    });
    const communityIds = [...new Set(caExecutions.map((e) => e.communityId))];

    // 4. Aggregate ratings across all those communities
    const agg = await prisma.communityRating.aggregate({
      where: { communityId: { in: communityIds } },
      _avg: { engagement: true, relevance: true, quality: true, speed: true, professionalism: true },
      _count: { id: true },
    });
    if (agg._count.id === 0) return;

    const overall =
      ((agg._avg.engagement ?? 0) +
        (agg._avg.relevance ?? 0) +
        (agg._avg.quality ?? 0) +
        (agg._avg.speed ?? 0) +
        (agg._avg.professionalism ?? 0)) /
      5;

    await prisma.communityAgent.update({
      where: { id: execution.caId },
      data: {
        reputation: {
          avgEngagement:      Math.round((agg._avg.engagement      ?? 0) * 100) / 100,
          avgRelevance:       Math.round((agg._avg.relevance        ?? 0) * 100) / 100,
          avgQuality:         Math.round((agg._avg.quality          ?? 0) * 100) / 100,
          avgSpeed:           Math.round((agg._avg.speed            ?? 0) * 100) / 100,
          avgProfessionalism: Math.round((agg._avg.professionalism  ?? 0) * 100) / 100,
          overallScore:       Math.round(overall * 100) / 100,
          totalRatings:       agg._count.id,
          lastUpdated:        new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    console.error('[Ratings] Score/reputation refresh failed:', err);
  }
}

// ==================== Offer Distribution ====================

async function distributeOffersForCampaign(campaignId: string): Promise<void> {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        communities: { include: { community: { select: { id: true, name: true, memberCount: true, caBotId: true, ownerTelegramId: true } } } },
        payment: true,
      },
    });

    if (!campaign || !campaign.payment) return;

    const totalCaReward = BigInt(campaign.payment.caReward);
    const communityCount = campaign.communities.length;
    if (communityCount === 0) return;

    const config = campaign.config as Record<string, unknown>;

    // targetCommunityCount = the advertiser's chosen N (pricing tier).
    // caReward is split across N communities, NOT across the N×1.5 overflow set.
    const targetCommunityCount = Number((config.targetCommunityCount as number | undefined) ?? communityCount);
    const divisor = targetCommunityCount > 0 ? BigInt(targetCommunityCount) : BigInt(communityCount);
    const perCommunityReward = totalCaReward / divisor;

    const durationKey = (config.durationKey as string) || '1w';

    const durationDays: Record<string, number> = { '1w': 7, '2w': 14, '4w': 28 };
    const days = durationDays[durationKey] ?? 1;
    const now = new Date();
    const executionEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Ensure the shared CA Bot agent record exists (upsert once before the loop)
    const caBot = await prisma.communityAgent.upsert({
      where: { botId: 'ms-community-agent-bot' },
      create: {
        botId: 'ms-community-agent-bot',
        name: 'MSCommunityAgent Bot',
        ownerWallet: '0x0000000000000000000000000000000000000000',
        status: 'active',
      },
      update: {},
    });

    // Create an Offer for each community (skip if already exists)
    for (const cc of campaign.communities) {
      const community = cc.community;

      await prisma.offer.upsert({
        where: {
          // Use a generated unique key via findFirst + create pattern since no natural unique
          // We create only if none exists for this campaign+community
          id: `offer_${campaignId}_${community.id}`,
        },
        create: {
          id: `offer_${campaignId}_${community.id}`,
          campaignId,
          communityId: community.id,
          caId: caBot.id,
          task: {
            type: 'shilling',
            // Use package requirements from config when available, otherwise sensible defaults
            requirements: ((config.packageRequirements as Record<string, unknown> | undefined) ?? {
              pinnedPost: true,
              groupAds: 3,
              discussions: 2,
            }) as any,
            promotionPackage: (config.promotionPackage as string | undefined) ?? null,
            durationKey,
            chainId: (config.chainId as number) ?? 97,
            promoteContent: (config.promoteContent as Record<string, string> | undefined) ?? null,
          },
          reward: {
            amount: perCommunityReward.toString(),
            token: 'USDT',
          },
          deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          executionStart: now,
          executionEnd,
          status: 'pending',
        },
        update: {},
      });
    }

    console.log(`[OfferDistribution] Created ${communityCount} offers for campaign ${campaignId}`);

    // Notify each community's CA Bot via the notification webhook (best-effort, non-blocking)
    const caNotifyUrl = process.env.CA_BOT_NOTIFY_URL || 'http://localhost:3002/notify-offer';
    const config2 = campaign.config as Record<string, unknown>;
    const objective = (config2.objective as string[] | string);
    const objectiveLabel = Array.isArray(objective) ? objective.join(', ') : (objective ?? 'Crypto Campaign');
    const promoteContent = (config2.promoteContent as Record<string, string> | undefined) ?? null;

    await Promise.allSettled(
      campaign.communities.map(async (cc) => {
        const com = cc.community as any;
        await fetch(caNotifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerTelegramId: com.ownerTelegramId ?? null,
            chatId: com.caBotId ?? com.id,
            offerId: `offer_${campaignId}_${com.id}`,
            projectName: objectiveLabel,
            rewardAmount: perCommunityReward.toString(),
            durationKey,
            deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            chainId: (config2.chainId as number) ?? 97,
            promoteContent,
            targetCommunityCount,
            requirements: (config2.packageRequirements as Record<string, unknown> | undefined) ?? {
              pinnedPost: true,
              groupAds: 3,
              discussions: 2,
            },
          }),
        });
      })
    );
  } catch (error) {
    console.error('[OfferDistribution] Error distributing offers:', error);
  }
}

export default router;
