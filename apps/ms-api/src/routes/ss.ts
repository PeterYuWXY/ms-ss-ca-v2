import { Router, Request, Response } from 'express';
import { prisma } from '@ms/database';
import { 
  validateShillingExecution, 
  processCampaignCompletion,
  generateShillingReport,
  calculateCAReputation 
} from '../services/shillingEngine.js';

const router: Router = Router();

/**
 * SS (Shilling Skill) Routes
 * Base path: /api/v1/ss
 */

// POST /api/v1/ss/validate - Validate shilling execution
router.post('/validate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { executionId } = req.body;

    const execution = await prisma.campaignExecution.findUnique({
      where: { id: executionId },
      include: {
        campaign: true
      }
    });

    if (!execution) {
      res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
      return;
    }

    const requirements = (execution.campaign.config as any)?.requirements || {
      pinnedPost: true,
      groupAds: 3,
      discussions: 2
    };

    const validation = validateShillingExecution(
      execution.shillingData as any,
      requirements
    );

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    console.error('Error validating execution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate execution'
    });
  }
});

// POST /api/v1/ss/complete - Complete campaign and process payments
router.post('/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.body;

    const result = await processCampaignCompletion(campaignId);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.message
      });
      return;
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error completing campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete campaign'
    });
  }
});

// GET /api/v1/ss/report/:executionId - Generate execution report
router.get('/report/:executionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { executionId } = req.params;

    const execution = await prisma.campaignExecution.findUnique({
      where: { id: executionId },
      include: {
        campaign: true,
        community: true,
        ca: true
      }
    });

    if (!execution) {
      res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
      return;
    }

    const requirements = (execution.campaign.config as any)?.requirements || {
      pinnedPost: true,
      groupAds: 3,
      discussions: 2
    };

    const report = generateShillingReport(execution as any, requirements);

    res.json({
      success: true,
      data: {
        ...report,
        execution: {
          id: execution.id,
          status: execution.status,
          community: execution.community?.name,
          ca: execution.ca?.name
        }
      }
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate report'
    });
  }
});

// GET /api/v1/ss/reputation/:caId - Get CA reputation
router.get('/reputation/:caId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { caId } = req.params;

    const reputation = await calculateCAReputation(caId);

    res.json({
      success: true,
      data: reputation
    });
  } catch (error) {
    console.error('Error calculating reputation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate reputation'
    });
  }
});

// POST /api/v1/ss/executions/:id/validate - Manual validation endpoint
router.post('/executions/:id/validate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { approved, notes } = req.body;

    const currentExecution = await prisma.campaignExecution.findUnique({ where: { id } });

    const execution = await prisma.campaignExecution.update({
      where: { id },
      data: {
        status: approved ? 'completed' : 'rejected',
        shillingData: {
          ...(currentExecution?.shillingData as object || {}),
          validation: {
            approved,
            notes,
            validatedAt: new Date().toISOString()
          }
        }
      }
    });

    res.json({
      success: true,
      data: execution
    });
  } catch (error) {
    console.error('Error validating execution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate execution'
    });
  }
});

export default router;