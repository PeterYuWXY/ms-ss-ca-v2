/**
 * CA Bot API 路由
 * 任务7/8/9相关: CA连接API + 执行上报 + 状态机
 * 
 * @author CodingDev
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { CampaignStateMachine, TaskStateMachine } from '../services/campaignState.js';

const router = Router();

// ==================== 验证Schema ====================

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
  type: z.enum(['pinned_post', 'group_ad', 'discussion', 'screenshot']),
  messageId: z.number().optional(),
  url: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
  timestamp: z.string().datetime(),
});

const updateTaskStatusSchema = z.object({
  caId: z.string(),
  status: z.enum(['in_progress', 'completed', 'failed']),
  details: z.record(z.any()).optional(),
  timestamp: z.string().datetime(),
});

// ==================== 中间件: CA认证 ====================

function caAuthMiddleware(req: Request, res: Response, next: () => void) {
  const caId = req.headers['x-ca-bot-id'] || req.body?.caId;
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  
  if (!caId) {
    return res.status(401).json({
      success: false,
      error: 'Missing CA Bot ID',
    });
  }
  
  // TODO: 验证API Key
  // if (!apiKey || !isValidApiKey(apiKey)) {
  //   return res.status(403).json({
  //     success: false,
  //     error: 'Invalid API key',
  //   });
  // }
  
  // 将caId添加到请求上下文
  (req as any).caId = caId;
  
  next();
}

// ==================== 路由: Offers ====================

/**
 * 获取可用的Offers
 * GET /ca/v1/offers
 */
router.get('/offers', caAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const caId = (req as any).caId;
    
    // TODO: 从数据库获取该CA的pending offers
    // const offers = await db.offers.findMany({
    //   where: { caId, status: 'pending' },
    // });
    
    // 返回模拟数据
    const mockOffers = [
      {
        id: 'offer_001',
        projectInfo: {
          name: 'Example DeFi Protocol',
          description: 'A revolutionary DeFi protocol',
        },
        reward: {
          amount: 100,
          token: 'USDT',
        },
        task: {
          duration: '7 days',
          requirements: {
            pinnedPost: true,
            groupAds: 3,
            discussions: 2,
          },
        },
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    ];
    
    res.json({
      success: true,
      data: mockOffers,
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
    const caId = (req as any).caId;
    
    const result = acceptOfferSchema.safeParse({
      ...req.body,
      caId,
    });
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: result.error.errors,
      });
    }
    
    // TODO: 更新数据库状态
    // await db.offers.update({
    //   where: { id: offerId },
    //   data: { status: 'accepted', caId, communityId: result.data.communityId },
    // });
    
    // 创建对应的Task
    const campaignId = `camp_${Date.now()}`;
    
    res.json({
      success: true,
      data: {
        offerId,
        campaignId,
        taskId: `task_${Date.now()}`,
        status: 'accepted',
        reward: {
          amount: 100,
          token: 'USDT',
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
    const caId = (req as any).caId;
    
    const result = rejectOfferSchema.safeParse({
      ...req.body,
      caId,
    });
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
      });
    }
    
    // TODO: 更新数据库
    
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
    const caId = (req as any).caId;
    const { communityId } = req.query;
    
    // TODO: 从数据库获取任务
    
    res.json({
      success: true,
      data: [],
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
    const caId = (req as any).caId;
    
    const result = reportExecutionSchema.safeParse({
      ...req.body,
      caId,
    });
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid execution data',
        details: result.error.errors,
      });
    }
    
    const executionData = result.data;
    
    // TODO: 保存执行记录到数据库
    // const execution = await db.executions.create({
    //   data: {
    //     taskId,
    //     caId: executionData.caId,
    //     type: executionData.type,
    //     messageId: executionData.messageId,
    //     url: executionData.url,
    //     metadata: executionData.metadata,
    //     status: 'pending', // 待验证
    //   },
    // });
    
    // 检查任务是否已完成所有要求
    // const task = await db.tasks.findUnique({ where: { id: taskId } });
    // const taskMachine = new TaskStateMachine(task);
    // if (taskMachine.checkCompletion()) {
    //   await taskMachine.transition('completed');
    // }
    
    res.json({
      success: true,
      data: {
        executionId: `exec_${Date.now()}`,
        taskId,
        status: 'pending',
        type: executionData.type,
        message: 'Execution recorded, pending verification',
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
    const caId = (req as any).caId;
    const { executions } = req.body;
    
    if (!Array.isArray(executions)) {
      return res.status(400).json({
        success: false,
        error: 'Executions must be an array',
      });
    }
    
    // TODO: 批量保存执行记录
    
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
    const caId = (req as any).caId;
    
    const result = updateTaskStatusSchema.safeParse({
      ...req.body,
      caId,
    });
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status data',
      });
    }
    
    const { status, details } = result.data;
    
    // TODO: 从数据库获取任务并更新状态
    // const task = await db.tasks.findUnique({ where: { id: taskId } });
    // const taskMachine = new TaskStateMachine(task);
    // const transitionResult = await taskMachine.transition(status);
    
    // if (!transitionResult.success) {
    //   return res.status(400).json({
    //     success: false,
    //     error: transitionResult.error,
    //   });
    // }
    
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
    const caId = (req as any).caId;
    
    // TODO: 从数据库计算收益
    
    res.json({
      success: true,
      data: {
        total: 0,
        pending: 0,
        thisMonth: 0,
        details: [],
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
    const caId = (req as any).caId;
    const { telegramId, name, username, memberCount } = req.body;
    
    // TODO: 保存社区信息到数据库
    
    res.json({
      success: true,
      data: {
        communityId: `comm_${Date.now()}`,
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
