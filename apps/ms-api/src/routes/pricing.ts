import { Router, Request, Response } from 'express';
import { calculatePricing } from '@ms/utils';

const router: Router = Router();

// GET /api/v1/pricing - Calculate pricing
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { duration, communityCount } = req.query;
    
    if (!duration || !communityCount) {
      res.status(400).json({
        success: false,
        error: 'duration and communityCount are required'
      });
      return;
    }
    
    const pricing = calculatePricing(
      duration as '1w' | '2w' | '4w',
      parseInt(communityCount as string) as 10 | 30 | 50
    );
    
    res.json({
      success: true,
      data: pricing
    });
  } catch (error) {
    console.error('Error calculating pricing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate pricing'
    });
  }
});

export default router;