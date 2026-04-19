/**
 * Public A2A (Agent-to-Agent) API
 *
 * Designed for external AI products and agents to integrate with the
 * Marketing Skill Platform programmatically.
 *
 * Design principles:
 *  - Clear pricing: every endpoint declares its USDT cost in the response
 *  - Fast: paginated, lean queries, no deep includes on list endpoints
 *  - Trust accumulation: community reputation scores included in all relevant responses
 *  - Low cost: flat micro-fee per API call (credited against a prepaid balance)
 *
 * Authentication: Bearer token (API key)
 *   Header: Authorization: Bearer <api_key>
 *
 * Rate limits:
 *   - Unauthenticated (discovery): 60 req/min
 *   - Authenticated: 300 req/min
 *
 * All monetary values are in USDT with 6 decimal places (micro-USDT strings).
 */

import { Router, Request, Response } from 'express';
import { prisma } from '@ms/database';
import { calculatePricing } from '@ms/utils';
import { createHash } from 'crypto';

const router: Router = Router();

// ==================== API Key Auth ====================

interface PublicApiKey {
  id: string;
  name: string;
  callCount: number;
}

/**
 * Lightweight API key validation for the public API.
 * API keys are stored in the CommunityAgent table (re-used for external callers).
 * A dedicated ApiKey table would be added in 2.0.
 */
async function validateApiKey(rawKey: string): Promise<PublicApiKey | null> {
  const hash = createHash('sha256').update(rawKey).digest('hex');
  const agent = await prisma.communityAgent.findFirst({
    where: { apiKeyHash: hash, status: 'active' },
    select: { id: true, name: true },
  });
  if (!agent) return null;
  return { id: agent.id, name: agent.name, callCount: 0 };
}

function getApiKey(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

// ==================== Discovery (no auth) ====================

/**
 * GET /api/public/v1
 * API manifest — lists available endpoints and their costs.
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Marketing Skill Platform — Public A2A API',
    version: '1.0.0',
    docs: 'https://ms.platform.com/api-docs',
    contact: 'dosiralphasniper@gmail.com',
    pricing_model: {
      unit: 'USDT',
      decimals: 6,
      note: 'Costs deducted from prepaid balance. Balance management endpoints coming in v2.',
    },
    endpoints: [
      { method: 'GET',  path: '/api/public/v1/communities',           auth: false, cost_usdt: '0',        desc: 'List communities with reputation scores' },
      { method: 'GET',  path: '/api/public/v1/communities/:id',        auth: false, cost_usdt: '0',        desc: 'Single community detail' },
      { method: 'GET',  path: '/api/public/v1/pricing',                auth: false, cost_usdt: '0',        desc: 'Campaign pricing table' },
      { method: 'POST', path: '/api/public/v1/campaigns/estimate',     auth: false, cost_usdt: '0',        desc: 'Estimate campaign cost without creating' },
      { method: 'POST', path: '/api/public/v1/campaigns',              auth: true,  cost_usdt: '0.100000', desc: 'Create a campaign (0.10 USDT API fee)' },
      { method: 'GET',  path: '/api/public/v1/campaigns/:id',          auth: true,  cost_usdt: '0.010000', desc: 'Get campaign status (0.01 USDT API fee)' },
      { method: 'GET',  path: '/api/public/v1/campaigns/:id/ratings',  auth: true,  cost_usdt: '0.010000', desc: 'Get community ratings for campaign' },
    ],
  });
});

// ==================== Communities (public, free) ====================

/**
 * GET /api/public/v1/communities
 *
 * Returns active communities with member count, languages, tags, and
 * aggregate reputation scores from past campaigns.
 *
 * Query params:
 *   limit    (default 20, max 100)
 *   offset   (default 0)
 *   language (filter, e.g. "en")
 *   minMembers
 *   sortBy   members | rating
 */
router.get('/communities', async (req: Request, res: Response) => {
  try {
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    const { language, minMembers } = req.query;

    const where: Record<string, unknown> = { status: 'active' };
    if (language) where.language = { has: language as string };
    if (minMembers) {
      const n = parseInt(minMembers as string);
      if (Number.isFinite(n) && n >= 0) where.memberCount = { gte: n };
    }

    const [communities, total] = await Promise.all([
      prisma.community.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          platform: true,
          memberCount: true,
          language: true,
          category: true,
          tags: true,
          rankings: true,
          activity: true,
          caBotId: true,
          status: true,
        },
        orderBy: req.query.sortBy === 'members' ? { memberCount: 'desc' } : { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.community.count({ where }),
    ]);

    // Aggregate ratings per community
    const communityIds = communities.map((c) => c.id);
    const ratings = await prisma.communityRating.groupBy({
      by: ['communityId'],
      where: { communityId: { in: communityIds } },
      _avg: { engagement: true, relevance: true, quality: true, speed: true, professionalism: true },
      _count: { id: true },
    });
    const ratingMap = new Map(ratings.map((r) => [r.communityId, r]));

    const data = communities.map((c) => {
      const r = ratingMap.get(c.id);
      return {
        ...c,
        reputation: r
          ? {
              count: r._count.id,
              engagement: r._avg.engagement ?? 0,
              relevance: r._avg.relevance ?? 0,
              quality: r._avg.quality ?? 0,
              speed: r._avg.speed ?? 0,
              professionalism: r._avg.professionalism ?? 0,
              overall: (
                ((r._avg.engagement ?? 0) + (r._avg.relevance ?? 0) + (r._avg.quality ?? 0) +
                  (r._avg.speed ?? 0) + (r._avg.professionalism ?? 0)) / 5
              ).toFixed(2),
            }
          : null,
      };
    });

    res.json({
      success: true,
      data,
      pagination: { total, limit, offset, hasMore: total > offset + communities.length },
      api_cost_usdt: '0',
    });
  } catch (error) {
    console.error('Public API communities error:', error);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

/**
 * GET /api/public/v1/communities/:id
 */
router.get('/communities/:id', async (req: Request, res: Response) => {
  try {
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) {
      res.status(404).json({ success: false, error: 'Community not found' });
      return;
    }
    const ratings = await prisma.communityRating.aggregate({
      where: { communityId: req.params.id },
      _avg: { engagement: true, relevance: true, quality: true, speed: true, professionalism: true },
      _count: { id: true },
    });

    res.json({
      success: true,
      data: {
        ...community,
        reputation: ratings._count.id > 0
          ? {
              count: ratings._count.id,
              engagement: ratings._avg.engagement ?? 0,
              relevance: ratings._avg.relevance ?? 0,
              quality: ratings._avg.quality ?? 0,
              speed: ratings._avg.speed ?? 0,
              professionalism: ratings._avg.professionalism ?? 0,
            }
          : null,
      },
      api_cost_usdt: '0',
    });
  } catch (error) {
    console.error('Public API community detail error:', error);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ==================== Pricing (public, free) ====================

const VALID_DURATIONS = ['1w', '2w', '4w'] as const;
const VALID_COUNTS = [10, 30, 50] as const;
type DurKey = typeof VALID_DURATIONS[number];
type CommCount = typeof VALID_COUNTS[number];

/**
 * GET /api/public/v1/pricing
 *
 * Returns the full pricing table so agents can plan budgets without extra calls.
 */
router.get('/pricing', (_req: Request, res: Response) => {
  const table: Record<string, Record<string, { total: string; platformFee: string; caReward: string }>> = {};
  for (const d of VALID_DURATIONS) {
    table[d] = {};
    for (const n of VALID_COUNTS) {
      table[d][n] = calculatePricing(d, n);
    }
  }
  res.json({ success: true, data: table, api_cost_usdt: '0' });
});

/**
 * POST /api/public/v1/campaigns/estimate
 *
 * Body: { durationKey: "1d"|"1w"|"1m", communityCount: 10|30|50 }
 * Returns pricing breakdown without creating anything.
 */
router.post('/campaigns/estimate', (req: Request, res: Response) => {
  const { durationKey, communityCount } = req.body;
  if (!VALID_DURATIONS.includes(durationKey)) {
    res.status(400).json({ success: false, error: `durationKey must be one of ${VALID_DURATIONS.join(', ')}` });
    return;
  }
  const count = Number(communityCount);
  if (!VALID_COUNTS.includes(count as CommCount)) {
    res.status(400).json({ success: false, error: `communityCount must be one of ${VALID_COUNTS.join(', ')}` });
    return;
  }
  const pricing = calculatePricing(durationKey as DurKey, count as CommCount);
  res.json({
    success: true,
    data: { durationKey, communityCount: count, ...pricing },
    api_cost_usdt: '0',
  });
});

// ==================== Campaigns (auth required) ====================

/**
 * POST /api/public/v1/campaigns
 *
 * Creates a campaign on behalf of the API caller.
 * Body: { durationKey, communityCount, advertiserWallet, skillId?, communityIds? }
 *
 * API fee: 0.10 USDT (deducted from prepaid balance — balance ledger in v2).
 */
router.post('/campaigns', async (req: Request, res: Response) => {
  const rawKey = getApiKey(req);
  if (!rawKey) {
    res.status(401).json({ success: false, error: 'Missing API key. Pass Bearer token in Authorization header.' });
    return;
  }
  const caller = await validateApiKey(rawKey);
  if (!caller) {
    res.status(403).json({ success: false, error: 'Invalid or inactive API key.' });
    return;
  }

  try {
    const { durationKey, communityCount, advertiserWallet, skillId, communityIds } = req.body;

    if (!VALID_DURATIONS.includes(durationKey)) {
      res.status(400).json({ success: false, error: `durationKey must be one of ${VALID_DURATIONS.join(', ')}` });
      return;
    }
    const count = Number(communityCount);
    if (!VALID_COUNTS.includes(count as CommCount)) {
      res.status(400).json({ success: false, error: `communityCount must be one of ${VALID_COUNTS.join(', ')}` });
      return;
    }
    if (!advertiserWallet?.match(/^0x[0-9a-fA-F]{40}$/)) {
      res.status(400).json({ success: false, error: 'advertiserWallet must be a valid EVM address.' });
      return;
    }

    const pricing = calculatePricing(durationKey as DurKey, count as CommCount);

    // Resolve skill
    const skill = skillId
      ? await prisma.skill.findUnique({ where: { id: skillId } })
      : await prisma.skill.findFirst({ where: { category: 'shilling' } });

    if (!skill) {
      res.status(400).json({ success: false, error: 'No shilling skill found. Provide a valid skillId.' });
      return;
    }

    // Resolve target communities
    const communities = communityIds?.length
      ? communityIds
      : (await prisma.community.findMany({
          where: { status: 'active' },
          orderBy: { memberCount: 'desc' },
          take: count,
          select: { id: true },
        })).map((c: { id: string }) => c.id);

    const campaignId = `api_${Date.now()}_${caller.id.slice(0, 8)}`;

    const campaign = await prisma.campaign.create({
      data: {
        id: campaignId,
        advertiserId: advertiserWallet,
        advertiserWallet,
        skillId: skill.id,
        config: { durationKey, communityCount: count, source: 'a2a_api' },
        status: 'draft',
        timeline: { createdAt: new Date().toISOString() },
        performance: { totalReach: 0, totalClicks: 0, conversionRate: 0, costPerClick: 0 },
        communities: {
          create: communities.map((id: string) => ({ communityId: id, status: 'pending' })),
        },
      },
    });

    await prisma.campaignPayment.create({
      data: {
        campaignId: campaign.id,
        totalAmount: pricing.total,
        platformFee: pricing.platformFee,
        caReward: pricing.caReward,
        status: 'pending',
      },
    });

    res.status(201).json({
      success: true,
      data: {
        campaignId: campaign.id,
        status: campaign.status,
        pricing,
        next_step: `To activate, call payCampaign on the MSCampaignVault contract with campaignId="${campaign.id}" and totalAmount=${pricing.total} USDT.`,
        contract_docs: 'https://ms.platform.com/docs/contracts',
      },
      api_cost_usdt: '0.100000',
    });
  } catch (error) {
    console.error('Public API create campaign error:', error);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

/**
 * GET /api/public/v1/campaigns/:id
 */
router.get('/campaigns/:id', async (req: Request, res: Response) => {
  const rawKey = getApiKey(req);
  if (!rawKey || !(await validateApiKey(rawKey))) {
    res.status(401).json({ success: false, error: 'Valid API key required.' });
    return;
  }
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { payment: true, _count: { select: { communities: true, executions: true } } },
    });
    if (!campaign) {
      res.status(404).json({ success: false, error: 'Campaign not found' });
      return;
    }
    res.json({ success: true, data: campaign, api_cost_usdt: '0.010000' });
  } catch (error) {
    console.error('Public API get campaign error:', error);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

/**
 * GET /api/public/v1/campaigns/:id/ratings
 */
router.get('/campaigns/:id/ratings', async (req: Request, res: Response) => {
  const rawKey = getApiKey(req);
  if (!rawKey || !(await validateApiKey(rawKey))) {
    res.status(401).json({ success: false, error: 'Valid API key required.' });
    return;
  }
  try {
    const ratings = await prisma.communityRating.findMany({ where: { campaignId: req.params.id } });
    res.json({ success: true, data: ratings, api_cost_usdt: '0.010000' });
  } catch (error) {
    console.error('Public API ratings error:', error);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

export default router;
