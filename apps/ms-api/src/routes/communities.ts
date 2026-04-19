import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@ms/database';
import { Errors } from '../utils/errors.js';

const router: Router = Router();

// ==================== Tag library ====================
// All communities must choose from this set (max 3)
export const TAG_LIBRARY = ['RWA', 'Trading', 'DeFi', 'Prediction', 'Alpha', 'NFT', 'GameFi', 'Layer2', 'AI', 'Meme'] as const;

// GET /api/v1/communities - List communities with aggregate ratings
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { language, minMembers, category, tag, caBotId, ownerTelegramId, ids } = req.query;

    // Sanitise pagination
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const where: any = { status: 'active' };

    if (language) {
      where.language = { has: language as string };
    }
    if (minMembers) {
      const n = parseInt(minMembers as string);
      if (Number.isFinite(n) && n >= 0) where.memberCount = { gte: n };
    }
    if (category) {
      where.category = category as string;
    }
    if (tag) {
      where.tags = { has: tag as string };
    }
    if (caBotId) {
      where.caBotId = caBotId as string;
    }
    if (ownerTelegramId) {
      where.ownerTelegramId = ownerTelegramId as string;
    }
    if (ids) {
      const idList = (ids as string).split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) where.id = { in: idList };
    }

    // sortBy: members (default) | activity | rating
    const sortBy = req.query.sortBy as string;
    const orderBy: any =
      sortBy === 'members' ? { memberCount: 'desc' }
      : sortBy === 'activity' ? { updatedAt: 'desc' }
      : { memberCount: 'desc' };

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
          createdAt: true,
        },
        take: limit,
        skip: offset,
        orderBy,
      }),
      prisma.community.count({ where }),
    ]);

    // Enrich with aggregate reputation from CommunityRating
    const communityIds = communities.map((c) => c.id);
    const ratingGroups = await prisma.communityRating.groupBy({
      by: ['communityId'],
      where: { communityId: { in: communityIds } },
      _avg: { engagement: true, relevance: true, quality: true, speed: true, professionalism: true },
      _count: { id: true },
    });
    const ratingMap = new Map(ratingGroups.map((r) => [r.communityId, r]));

    const data = communities.map((c) => {
      const r = ratingMap.get(c.id);
      return {
        ...c,
        reputation: r
          ? {
              count: r._count.id,
              engagement: Number((r._avg.engagement ?? 0).toFixed(1)),
              relevance: Number((r._avg.relevance ?? 0).toFixed(1)),
              quality: Number((r._avg.quality ?? 0).toFixed(1)),
              speed: Number((r._avg.speed ?? 0).toFixed(1)),
              professionalism: Number((r._avg.professionalism ?? 0).toFixed(1)),
              overall: Number(
                (((r._avg.engagement ?? 0) + (r._avg.relevance ?? 0) + (r._avg.quality ?? 0) +
                  (r._avg.speed ?? 0) + (r._avg.professionalism ?? 0)) / 5).toFixed(1)
              ),
            }
          : null,
      };
    });

    // If sortBy=rating, sort client-side after enrichment (no DB index on computed field)
    if (sortBy === 'rating') {
      data.sort((a, b) => (b.reputation?.overall ?? 0) - (a.reputation?.overall ?? 0));
    }

    res.json({
      success: true,
      data,
      pagination: { total, limit, offset, hasMore: total > offset + communities.length },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/communities/tags - Return the tag library
router.get('/tags', (_req: Request, res: Response): void => {
  res.json({ success: true, data: TAG_LIBRARY });
});

// GET /api/v1/communities/:id - Get community by ID with reputation
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    const [community, ratings] = await Promise.all([
      prisma.community.findUnique({ where: { id } }),
      prisma.communityRating.aggregate({
        where: { communityId: id },
        _avg: { engagement: true, relevance: true, quality: true, speed: true, professionalism: true },
        _count: { id: true },
      }),
    ]);

    if (!community) {
      throw Errors.NOT_FOUND('Community', id);
    }

    res.json({
      success: true,
      data: {
        ...community,
        reputation: ratings._count.id > 0
          ? {
              count: ratings._count.id,
              engagement: Number((ratings._avg.engagement ?? 0).toFixed(1)),
              relevance: Number((ratings._avg.relevance ?? 0).toFixed(1)),
              quality: Number((ratings._avg.quality ?? 0).toFixed(1)),
              speed: Number((ratings._avg.speed ?? 0).toFixed(1)),
              professionalism: Number((ratings._avg.professionalism ?? 0).toFixed(1)),
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/communities - Create community
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, description, language, memberCount, category, ownerWallet, tags } = req.body;

    if (!name || !ownerWallet) {
      throw Errors.VALIDATION('Name and ownerWallet are required');
    }

    const validTags = (Array.isArray(tags) ? tags : [])
      .filter((t: string) => (TAG_LIBRARY as readonly string[]).includes(t));

    const community = await prisma.community.create({
      data: {
        name,
        description,
        language: Array.isArray(language) ? language : ['en'],
        memberCount: memberCount ?? 0,
        category: category ?? 'general',
        status: 'active',
        tags: validTags,
        ownerWallet,
      },
    });

    res.status(201).json({ success: true, data: community });
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/communities/:id - Update community profile (language, tags, etc.)
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { language, tags, name, memberCount } = req.body;

    const data: Record<string, unknown> = {};
    if (language !== undefined) data.language = Array.isArray(language) ? language : [language];
    if (tags     !== undefined) data.tags     = (Array.isArray(tags) ? tags : []).filter((t: string) => (TAG_LIBRARY as readonly string[]).includes(t));
    if (name     !== undefined) data.name     = name;
    if (memberCount !== undefined) data.memberCount = memberCount;

    const community = await prisma.community.update({ where: { id }, data });
    res.json({ success: true, data: community });
  } catch (error) {
    next(error);
  }
});

export default router;
