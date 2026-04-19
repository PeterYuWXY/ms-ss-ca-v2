import { Router, Request, Response } from 'express';
import { prisma } from '@ms/database';
import { z } from 'zod';

const router: Router = Router();

// Schema for payment confirmation
const confirmPaymentSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

/**
 * POST /api/campaigns/:campaignId/confirm-payment
 * 
 * Confirm payment on-chain and update campaign status
 * P1-4: 添加支付流程交易监听和状态同步
 */
router.post('/:campaignId/confirm-payment', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    const result = confirmPaymentSchema.safeParse(req.body);
    
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid transaction hash',
        details: result.error.errors,
      });
      return;
    }
    
    const { txHash } = result.data;
    
    // Find the campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { payment: true },
    });
    
    if (!campaign) {
      res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
      return;
    }
    
    if (!campaign.payment) {
      res.status(400).json({
        success: false,
        error: 'Campaign payment record not found',
      });
      return;
    }

    // Idempotency: already confirmed, return current state
    if (campaign.payment.status === 'paid') {
      res.json({
        success: true,
        data: {
          campaignId,
          status: campaign.status,
          paymentStatus: campaign.payment.status,
          txHash: campaign.payment.txHash,
          paidAt: campaign.payment.paidAt,
        },
      });
      return;
    }

    // Wrap both updates in a transaction to prevent partial state
    const [updatedPayment, updatedCampaign] = await prisma.$transaction([
      prisma.campaignPayment.update({
        where: { campaignId },
        data: {
          status: 'paid',
          txHash,
          paidAt: new Date(),
        },
      }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'active',
          timeline: {
            ...(campaign.timeline as Record<string, unknown>),
            paidAt: new Date().toISOString(),
            activatedAt: new Date().toISOString(),
          },
        },
      }),
    ]);
    
    res.json({
      success: true,
      data: {
        campaignId,
        status: updatedCampaign.status,
        paymentStatus: updatedPayment.status,
        txHash: updatedPayment.txHash,
        paidAt: updatedPayment.paidAt,
      },
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to confirm payment',
    });
  }
});

/**
 * GET /api/campaigns/:campaignId/payment-status
 * 
 * Check payment status for a campaign
 */
router.get('/:campaignId/payment-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    
    const payment = await prisma.campaignPayment.findUnique({
      where: { campaignId },
    });
    
    if (!payment) {
      res.status(404).json({
        success: false,
        error: 'Payment record not found',
      });
      return;
    }
    
    res.json({
      success: true,
      data: {
        campaignId,
        status: payment.status,
        totalAmount: payment.totalAmount,
        platformFee: payment.platformFee,
        caReward: payment.caReward,
        txHash: payment.txHash,
        paidAt: payment.paidAt,
      },
    });
  } catch (error) {
    console.error('Error fetching payment status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment status',
    });
  }
});

/**
 * POST /api/campaigns/:campaignId/refund
 * 
 * Handle payment failure and refund (rollback mechanism)
 * P1-5: 添加支付失败回滚机制
 */
router.post('/:campaignId/refund', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    const { reason } = req.body;
    
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { payment: true },
    });
    
    if (!campaign) {
      res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
      return;
    }
    
    // Only allow refund for pending campaigns
    if (campaign.status !== 'draft' && campaign.status !== 'pending') {
      res.status(400).json({
        success: false,
        error: `Cannot refund campaign with status: ${campaign.status}`,
      });
      return;
    }
    
    // Update payment status to refunded
    if (campaign.payment) {
      await prisma.campaignPayment.update({
        where: { campaignId },
        data: {
          status: 'refunded',
        },
      });
    }
    
    // Update campaign status to cancelled
    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'cancelled',
        timeline: {
          ...(campaign.timeline as Record<string, unknown>),
          cancelledAt: new Date().toISOString(),
          cancelReason: reason || 'Payment failed',
        },
      },
    });
    
    res.json({
      success: true,
      data: {
        campaignId,
        status: updatedCampaign.status,
        reason: reason || 'Payment failed',
      },
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process refund',
    });
  }
});

export default router;
