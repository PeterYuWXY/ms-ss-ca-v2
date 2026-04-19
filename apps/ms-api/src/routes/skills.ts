import { Router, Request, Response } from 'express';
import { prisma } from '@ms/database';

const router: Router = Router();

// GET /api/v1/skills - List skills
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const skills = await prisma.skill.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({
      success: true,
      data: skills
    });
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch skills'
    });
  }
});

// GET /api/v1/skills/:id - Get skill by ID
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const skill = await prisma.skill.findUnique({
      where: { id }
    });
    
    if (!skill) {
      res.status(404).json({
        success: false,
        error: 'Skill not found'
      });
      return;
    }
    
    res.json({
      success: true,
      data: skill
    });
  } catch (error) {
    console.error('Error fetching skill:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch skill'
    });
  }
});

export default router;