import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@ms/database';

const router: Router = Router();

// GET /api/v1/offers — query offers by communityId, status, campaignId
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { communityId, campaignId, status } = req.query;

    const limitRaw = parseInt(req.query.limit as string);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;

    const where: any = {};
    if (communityId) where.communityId = communityId as string;
    if (campaignId) where.campaignId = campaignId as string;
    if (status) where.status = status as string;

    const offers = await prisma.offer.findMany({ where, take: limit, orderBy: { deadline: 'asc' } });
    res.json({ success: true, data: offers });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/offers/:id — get single offer
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const offer = await prisma.offer.findUnique({ where: { id: req.params.id } });

    if (!offer) {
      res.status(404).json({ success: false, error: 'Offer not found' });
      return;
    }

    res.json({ success: true, data: offer });
  } catch (err) {
    next(err);
  }
});

export default router;
