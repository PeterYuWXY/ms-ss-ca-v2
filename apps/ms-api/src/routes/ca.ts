import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { prisma } from '@ms/database';
import { CampaignStateMachine, TaskStateMachine } from '../services/campaignState.js';
import { checkAndSettleCampaignIfComplete } from '../services/vaultService.js';
import { aggregateCampaignPerformance } from '../services/performanceAggregator.js';

const router: Router = Router();

// ==================== 类型定义 ====================

interface OfferReward {
  amount: string;
  token: string;
}

interface CampaignConfig {
  projectInfo?: {
    name?: string;
    description?: string;
  };
  [key: string]: unknown;
}

interface OfferWithCampaign {
  id: string;
  campaignId: string;
  campaign?: {
    config: CampaignConfig;
  } | null;
  task: unknown;
  reward: unknown;
  deadline: Date;
  executionStart: Date | null;
  executionEnd: Date | null;
}

// ==================== 验证Schema ====================

import { z } from 'zod';

const acceptOfferSchema = z.object({
  caId: z.string(),
  communityId: z.string(),
});

const rejectOfferSchema = z.object({
  caId: z.string(),
  reason: z.string().optional(),
});

const reportExecutionSchema = z.object({
  caId: z.string(),
  type: z.enum(['pinned_post', 'group_ad', 'discussion', 'screenshot', 'unpinned_post']),
  messageId: z.number().optional(),
  url: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
});

const updateTaskStatusSchema = z.object({
  caId: z.string(),
  status: z.enum(['executing', 'completed']),
  details: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
});

// ==================== 中间件: CA认证 ====================

async function caAuthMiddleware(req: Request, res: Response, next: () => void) {
  const botId = (req.headers['x-ca-bot-id'] as string) || req.body?.caId;
  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  if (!botId) {
    res.status(401).json({
      success: false,
      error: 'Missing CA Bot ID',
    });
    return;
  }

  // Lookup CommunityAgent by botId to confirm it exists
  const agent = await prisma.communityAgent.findUnique({
    where: { botId },
    select: { id: true, apiKeyHash: true, status: true },
  });

  if (!agent) {
    res.status(401).json({
      success: false,
      error: 'Unknown CA Bot ID',
    });
    return;
  }

  if (agent.status !== 'active') {
    res.status(403).json({
      success: false,
      error: 'CA is not active',
    });
    return;
  }

  // If an apiKeyHash is stored, validate the provided key
  if (agent.apiKeyHash) {
    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: 'Missing API key',
      });
      return;
    }
    const providedHash = createHash('sha256').update(apiKey).digest('hex');
    if (providedHash !== agent.apiKeyHash) {
      res.status(403).json({
        success: false,
        error: 'Invalid API key',
      });
      return;
    }
  }

  // Attach the CommunityAgent primary id (not botId) to the request
  (req as Request & { caId: string }).caId = agent.id;

  next();
}

// ==================== 路由: Offers ====================

/**
 * 获取可用的Offers
 * GET /ca/v1/offers
 */
router.get('/offers', caAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const caId = (req as Request & { caId: string }).caId;
    
    // 从数据库获取该CA的pending offers
    const offers = await prisma.offer.findMany({
      where: { 
        caId, 
        status: 'pending' 
      },
    });
    
    // 获取关联的campaign配置
    const campaignIds = [...new Set(offers.map(o => o.campaignId))];
    const campaigns = await prisma.campaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, config: true },
    });
    const campaignConfigMap = new Map(campaigns.map(c => [c.id, c.config]));
    
    // 格式化offers - 修复类型安全问题
    const formattedOffers = offers.map((offer) => {
      const reward = (offer.reward as unknown) as OfferReward | undefined;
      const config = campaignConfigMap.get(offer.campaignId) as CampaignConfig | undefined;
      
      return {
        id: offer.id,
        campaignId: offer.campaignId,
        projectInfo: config?.projectInfo ?? {},
        task: offer.task,
        reward: {
          amount: reward?.amount ?? '0',
          token: reward?.token ?? 'USDT',
        },
        deadline: offer.deadline,
        executionStart: offer.executionStart,
        executionEnd: offer.executionEnd,
      };
    });
    
    res.json({
      success: true,
      data: formattedOffers,
    });
  } catch (error) {
    console.error('Error fetching offers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch offers',
    });
  }
});

/**
 * 接受Offer
 * POST /ca/v1/offers/:offerId/accept
 */
router.post('/offers/:offerId/accept', caAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { offerId } = req.params;
    const caId = (req as Request & { caId: string }).caId;
    
    const result = acceptOfferSchema.safeParse({
      ...req.body,
      caId,
    });
    
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: result.error.errors,
      });
      return;
    }
    
    // 获取offer详情
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      res.status(404).json({
        success: false,
        error: 'Offer not found',
      });
      return;
    }

    // Guard: offer must be pending
    if (offer.status !== 'pending') {
      res.status(400).json({
        success: false,
        error: `Offer is already ${offer.status}`,
      });
      return;
    }

    // ── Slot-full check (outside transaction for a fast early bail-out) ──────
    // targetCommunityCount is stored in campaign.config.targetCommunityCount (or communityCount).
    // We compare against currently accepted offers for this campaign.
    // If slots are already full, reject immediately before touching any state.
    {
      const campaign = await prisma.campaign.findUnique({
        where: { id: offer.campaignId },
        select: { config: true },
      });
      const cfg = (campaign?.config ?? {}) as Record<string, unknown>;
      const targetCount = Number(
        (cfg.targetCommunityCount as number | undefined) ??
        (cfg.communityCount    as number | undefined) ??
        0
      );
      if (targetCount > 0) {
        const acceptedCount = await prisma.offer.count({
          where: { campaignId: offer.campaignId, status: 'accepted' },
        });
        if (acceptedCount >= targetCount) {
          res.status(409).json({
            success: false,
            error: 'SLOTS_FULL',
            message: `All ${targetCount} promotion slots for this campaign have been filled.`,
          });
          return;
        }
      }
    }

    // Atomic: update offer + create execution + update community in one transaction
    let execution: { id: string };
    try {
      const txResult = await prisma.$transaction(async (tx) => {
        // Re-check slot count atomically inside the transaction to prevent race conditions
        const cfg2 = (
          await tx.campaign.findUnique({ where: { id: offer.campaignId }, select: { config: true } })
        )?.config as Record<string, unknown> | undefined ?? {};
        const targetCount2 = Number(
          (cfg2.targetCommunityCount as number | undefined) ??
          (cfg2.communityCount       as number | undefined) ??
          0
        );
        if (targetCount2 > 0) {
          const acceptedCount2 = await tx.offer.count({
            where: { campaignId: offer.campaignId, status: 'accepted' },
          });
          if (acceptedCount2 >= targetCount2) {
            // Throw a recognisable sentinel so the outer catch returns 409
            const err = new Error('SLOTS_FULL') as any;
            err.code = 'SLOTS_FULL';
            throw err;
          }
        }

        // Atomic status check-and-update: will throw if offer was concurrently accepted
        const updatedOffer = await tx.offer.update({
          where: { id: offerId, status: 'pending' },
          data: { status: 'accepted' },
        });

        const newExecution = await tx.campaignExecution.create({
          data: {
            campaignId: updatedOffer.campaignId,
            communityId: result.data.communityId,
            caId,
            status: 'accepted',
            shillingData: {},
          },
        });

        await tx.campaignCommunity.updateMany({
          where: {
            campaignId: updatedOffer.campaignId,
            communityId: result.data.communityId,
          },
          data: { status: 'accepted' },
        });

        return newExecution;
      });
      execution = txResult;
    } catch (txError: unknown) {
      const code = (txError as { code?: string })?.code;
      // Slots filled during our transaction window
      if (code === 'SLOTS_FULL') {
        res.status(409).json({
          success: false,
          error: 'SLOTS_FULL',
          message: 'All promotion slots for this campaign have been filled.',
        });
        return;
      }
      // Prisma P2025: record not found (offer was concurrently accepted)
      if (code === 'P2025') {
        res.status(409).json({
          success: false,
          error: 'Offer was already accepted by another CA',
        });
        return;
      }
      throw txError;
    }

    const reward = offer.reward as unknown as OfferReward | undefined;
    
    res.json({
      success: true,
      data: {
        offerId,
        executionId: execution.id,
        campaignId: offer.campaignId,
        status: 'accepted',
        reward: {
          amount: reward?.amount ?? '0',
          token: reward?.token ?? 'USDT',
        },
      },
    });
  } catch (error) {
    console.error('Error accepting offer:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to accept offer',
    });
  }
});

/**
 * 拒绝Offer
 * POST /ca/v1/offers/:offerId/reject
 */
router.post('/offers/:offerId/reject', caAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { offerId } = req.params;
    const caId = (req as Request & { caId: string }).caId;
    
    const result = rejectOfferSchema.safeParse({
      ...req.body,
      caId,
    });
    
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
      });
      return;
    }
    
    // 获取offer
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
    });
    
    if (!offer) {
      res.status(404).json({
        success: false,
        error: 'Offer not found',
      });
      return;
    }
    
    // 更新offer状态
    await prisma.offer.update({
      where: { id: offerId },
      data: { status: 'rejected' },
    });
    
    // 更新campaign community状态
    await prisma.campaignCommunity.updateMany({
      where: {
        campaignId: offer.campaignId,
        communityId: offer.communityId,
      },
      data: { status: 'rejected' },
    });
    
    res.json({
      success: true,
      data: { offerId, status: 'rejected' },
    });
  } catch (error) {
    console.error('Error rejecting offer:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject offer',
    });
  }
});

// ==================== 路由: Tasks ====================

/**
 * 获取任务列表
 * GET /ca/v1/tasks
 */
router.get('/tasks', caAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const caId = (req as Request & { caId: string }).caId;
    const { communityId } = req.query;
    
    // 从数据库获取任务
    const executions = await prisma.campaignExecution.findMany({
      where: {
        caId,
        ...(communityId ? { communityId: communityId as string } : {}),
      },
      include: {
        campaign: {
          select: {
            id: true,
            config: true,
            status: true,
          },
        },
      },
    });
    
    res.json({
      success: true,
      data: executions,
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tasks',
    });
  }
});

// ==================== 路由: Executions (任务8) ====================

/**
 * 上报执行结果
 * POST /api/v1/tasks/:taskId/executions
 * 
 * 任务8: CA执行上报SS
 */
router.post('/tasks/:taskId/executions', caAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const caId = (req as Request & { caId: string }).caId;
    
    const result = reportExecutionSchema.safeParse({
      ...req.body,
      caId,
    });
    
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid execution data',
        details: result.error.errors,
      });
      return;
    }
    
    const executionData = result.data;

    // Load current shillingData so we can merge safely
    const existing = await prisma.campaignExecution.findUnique({ where: { id: taskId } });
    const current = (existing?.shillingData ?? {}) as Record<string, unknown>;

    const entry = {
      messageId: executionData.messageId,
      url: executionData.url,
      metadata: executionData.metadata,
      timestamp: executionData.timestamp,
    };

    // Merge strategy per action type:
    //   pinned_post   → single object + top-level pinnedAt
    //   unpinned_post → record unpinnedAt, update pinned_post duration
    //   group_ad      → append to array (preserves all ad posts)
    //   discussion    → append to array
    //   screenshot    → append to array
    let patch: Record<string, unknown> = {};

    if (executionData.type === 'pinned_post') {
      patch = {
        pinned_post: entry,
        pinnedAt: executionData.timestamp,
      };
    } else if (executionData.type === 'unpinned_post') {
      patch = { unpinnedAt: executionData.timestamp };
    } else {
      // Array types: group_ad, discussion, screenshot
      const key = executionData.type === 'group_ad' ? 'group_ads' : `${executionData.type}s`;
      const prev = Array.isArray(current[key]) ? (current[key] as unknown[]) : [];
      patch = { [key]: [...prev, entry] };
    }

    const updated = await prisma.campaignExecution.update({
      where: { id: taskId },
      data: {
        status: 'executing',
        shillingData: { ...current, ...patch } as any,
      },
    });

    // Re-aggregate performance for this campaign so the dashboard reflects the new action
    aggregateCampaignPerformance(updated.campaignId).catch(() => {});

    res.json({
      success: true,
      data: {
        executionId: taskId,
        status: 'executing',
        type: executionData.type,
        message: 'Execution recorded',
      },
    });
  } catch (error) {
    console.error('Error reporting execution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to report execution',
    });
  }
});

/**
 * 批量上报执行结果
 * POST /api/v1/tasks/:taskId/executions/batch
 */
router.post('/tasks/:taskId/executions/batch', caAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const caId = (req as Request & { caId: string }).caId;
    const { executions } = req.body;
    
    if (!Array.isArray(executions)) {
      res.status(400).json({
        success: false,
        error: 'Executions must be an array',
      });
      return;
    }
    
    // 获取现有execution
    const existingExecution = await prisma.campaignExecution.findUnique({
      where: { id: taskId },
    });
    
    if (!existingExecution) {
      res.status(404).json({
        success: false,
        error: 'Execution not found',
      });
      return;
    }
    
    const existingData = (existingExecution.shillingData as any) ?? {};
    
    // 合并执行记录
    const updatedShillingData = { ...existingData };
    for (const exec of executions) {
      if (exec.type) {
        updatedShillingData[exec.type] = {
          messageId: exec.messageId,
          url: exec.url,
          metadata: exec.metadata,
          timestamp: exec.timestamp,
        };
      }
    }
    
    // 更新execution
    await prisma.campaignExecution.update({
      where: { id: taskId },
      data: {
        shillingData: updatedShillingData,
      },
    });
    
    res.json({
      success: true,
      data: {
        taskId,
        recordedCount: executions.length,
        message: 'Batch executions recorded',
      },
    });
  } catch (error) {
    console.error('Error reporting batch executions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to report batch executions',
    });
  }
});

// ==================== 路由: Task Status (任务9) ====================

/**
 * 更新任务状态
 * PATCH /api/v1/tasks/:taskId/status
 * 
 * 任务9: Campaign状态机
 */
router.patch('/tasks/:taskId/status', caAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const caId = (req as Request & { caId: string }).caId;
    
    const result = updateTaskStatusSchema.safeParse({
      ...req.body,
      caId,
    });
    
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid status data',
      });
      return;
    }
    
    const { status, details } = result.data;
    
    // 获取execution
    const execution = await prisma.campaignExecution.findUnique({
      where: { id: taskId },
    });
    
    if (!execution) {
      res.status(404).json({
        success: false,
        error: 'Execution not found',
      });
      return;
    }
    
    // 使用状态机验证状态转换
    const machine = new TaskStateMachine(execution);
    const transitionResult = machine.transition(status);
    
    if (!transitionResult.success) {
      res.status(400).json({
        success: false,
        error: transitionResult.error,
      });
      return;
    }
    
    // 更新execution状态
    const updatedExecution = await prisma.campaignExecution.update({
      where: { id: taskId },
      data: {
        status,
        shillingData: {
          ...(execution.shillingData as any ?? {}),
          statusDetails: details,
          statusUpdatedAt: new Date().toISOString(),
        } as any,
      },
    });
    
    // Sync offer status and create payment record when task finalizes
    if (status === 'completed') {
      const isFailed = (details as Record<string, unknown>)?.failed === true;

      const offer = await prisma.offer.findFirst({
        where: {
          campaignId: execution.campaignId,
          caId: execution.caId,
        },
      });

      if (offer) {
        if (isFailed) {
          // Mark offer as failed — no reward for this CA
          await prisma.offer.update({
            where: { id: offer.id },
            data: { status: 'failed' },
          });
        } else {
          // Mark offer as completed and record expected payment
          const reward = offer.reward as unknown as OfferReward | undefined;
          const rewardAmount = reward?.amount ?? '0';

          await prisma.$transaction([
            prisma.offer.update({
              where: { id: offer.id },
              data: { status: 'completed' },
            }),
            prisma.executionPayment.upsert({
              where: { executionId: taskId },
              create: { executionId: taskId, amount: rewardAmount, status: 'pending' },
              update: {},
            }),
          ]);
        }
      }

      // Fire-and-forget settlement check — runs after all offers are terminal
      checkAndSettleCampaignIfComplete(execution.campaignId).catch((err) =>
        console.error('[ca.ts] Settlement check failed:', err)
      );
    }

    res.json({
      success: true,
      data: {
        taskId,
        status,
        updatedAt: new Date().toISOString(),
        details,
      },
    });
  } catch (error) {
    console.error('Error updating task status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update task status',
    });
  }
});

// ==================== 路由: Earnings ====================

/**
 * 获取收益信息
 * GET /ca/v1/earnings
 */
router.get('/earnings', caAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const caId = (req as Request & { caId: string }).caId;
    
    // 获取所有execution payments
    const executions = await prisma.campaignExecution.findMany({
      where: { caId },
      include: {
        payment: true,
      },
    });
    
    // 计算总收益
    let total = BigInt(0);
    let pending = BigInt(0);
    let thisMonth = BigInt(0);
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    for (const execution of executions) {
      if (execution.payment) {
        const amount = BigInt(execution.payment.amount);
        total += amount;
        
        if (execution.payment.status === 'pending' || execution.payment.status === 'paid') {
          pending += amount;
        }
        
        if (execution.createdAt >= startOfMonth) {
          thisMonth += amount;
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        total: total.toString(),
        pending: pending.toString(),
        thisMonth: thisMonth.toString(),
        details: executions.map(e => ({
          executionId: e.id,
          campaignId: e.campaignId,
          amount: e.payment?.amount ?? '0',
          status: e.payment?.status ?? 'pending',
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching earnings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch earnings',
    });
  }
});

// ==================== 路由: Communities ====================

/**
 * 注册社区
 * POST /ca/v1/communities/register
 */
router.post('/communities/register', caAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const caId = (req as Request & { caId: string }).caId;
    const { telegramId, name, username, memberCount } = req.body;
    
    // 创建或更新社区
    const community = await prisma.community.create({
      data: {
        name,
        platform: 'telegram',
        memberCount: memberCount ?? 0,
        caBotId: telegramId,
        ownerWallet: caId,
        status: 'active',
        category: 'general',
        tags: [],
        language: ['en'],
      },
    });
    
    res.json({
      success: true,
      data: {
        communityId: community.id,
        telegramId,
        name,
        status: 'pending_verification',
      },
    });
  } catch (error) {
    console.error('Error registering community:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register community',
    });
  }
});

export default router;
