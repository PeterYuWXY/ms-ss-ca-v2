/**
 * Campaign 状态机
 * 状态流转: Pending -> Active -> Completed/Failed
 * 
 * @author CodingDev
 * @version 1.0.0
 */

// ==================== 类型定义 ====================

export type CampaignStatus = 
  | 'pending'     // 待处理: 刚创建，等待支付
  | 'active'      // 进行中: 已支付，任务执行中
  | 'paused'      // 暂停: 临时停止
  | 'completed'   // 完成: 所有任务完成
  | 'failed'      // 失败: 支付失败或其他错误
  | 'cancelled';  // 取消: 用户取消

export type TaskStatus =
  | 'pending'     // 待处理
  | 'in_progress' // 进行中
  | 'completed'   // 完成
  | 'failed'      // 失败
  | 'expired';    // 过期

export interface Campaign {
  id: string;
  advertiserId: string;
  status: CampaignStatus;
  budget: {
    total: bigint;
    spent: bigint;
    remaining: bigint;
  };
  tasks: Task[];
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface Task {
  id: string;
  campaignId: string;
  status: TaskStatus;
  caId?: string;           // 分配的CA
  communityId?: string;    // 分配的社区
  requirements: {
    pinnedPost?: boolean;
    groupAds?: number;
    discussions?: number;
  };
  executions: Execution[];
  deadline?: Date;
}

export interface Execution {
  id: string;
  taskId: string;
  caId: string;
  type: 'pinned_post' | 'group_ad' | 'discussion' | 'screenshot';
  status: 'pending' | 'verified' | 'rejected';
  messageId?: number;
  url?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  verifiedAt?: Date;
}

// ==================== 状态流转规则 ====================

interface Transition {
  from: CampaignStatus;
  to: CampaignStatus;
  condition: (campaign: Campaign) => boolean;
  action?: (campaign: Campaign) => Promise<void>;
}

const campaignTransitions: Transition[] = [
  // Pending -> Active: 支付完成
  {
    from: 'pending',
    to: 'active',
    condition: (c) => c.budget.spent > 0n,
    action: async (c) => {
      c.startedAt = new Date();
      console.log(`[StateMachine] Campaign ${c.id} activated`);
    },
  },
  // Pending -> Failed: 支付失败或超时
  {
    from: 'pending',
    to: 'failed',
    condition: (c) => {
      const createdTime = c.createdAt.getTime();
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      return now - createdTime > oneDay && c.budget.spent === 0n;
    },
  },
  // Active -> Paused: 用户暂停
  {
    from: 'active',
    to: 'paused',
    condition: () => true, // 任何时候都可以暂停
  },
  // Paused -> Active: 恢复
  {
    from: 'paused',
    to: 'active',
    condition: () => true,
  },
  // Active -> Completed: 所有任务完成
  {
    from: 'active',
    to: 'completed',
    condition: (c) => {
      if (c.tasks.length === 0) return false;
      return c.tasks.every(t => 
        t.status === 'completed' || t.status === 'failed' || t.status === 'expired'
      );
    },
    action: async (c) => {
      c.completedAt = new Date();
      console.log(`[StateMachine] Campaign ${c.id} completed`);
    },
  },
  // Active -> Failed: 严重错误
  {
    from: 'active',
    to: 'failed',
    condition: (c) => {
      const failedTasks = c.tasks.filter(t => t.status === 'failed').length;
      return failedTasks > c.tasks.length / 2; // 超过一半任务失败
    },
  },
  // Pending/Active -> Cancelled: 用户取消
  {
    from: 'pending',
    to: 'cancelled',
    condition: () => true,
  },
  {
    from: 'active',
    to: 'cancelled',
    condition: (c) => c.budget.spent === 0n, // 只有在未消费时可以取消
  },
];

// ==================== 任务状态流转 ====================

const taskTransitions: Transition[] = [
  // Pending -> InProgress: CA接受任务
  {
    from: 'pending',
    to: 'in_progress',
    condition: (t: any) => !!t.caId && !!t.communityId,
  },
  // InProgress -> Completed: 满足所有要求
  {
    from: 'in_progress',
    to: 'completed',
    condition: (t: Task) => {
      const execs = t.executions || [];
      
      // 检查pinnedPost
      if (t.requirements.pinnedPost) {
        const hasPinned = execs.some(e => 
          e.type === 'pinned_post' && e.status === 'verified'
        );
        if (!hasPinned) return false;
      }
      
      // 检查groupAds数量
      if (t.requirements.groupAds) {
        const adCount = execs.filter(e => 
          e.type === 'group_ad' && e.status === 'verified'
        ).length;
        if (adCount < t.requirements.groupAds) return false;
      }
      
      // 检查discussions数量
      if (t.requirements.discussions) {
        const discussionCount = execs.filter(e => 
          e.type === 'discussion' && e.status === 'verified'
        ).length;
        if (discussionCount < t.requirements.discussions) return false;
      }
      
      return true;
    },
  },
  // InProgress -> Failed: 执行失败
  {
    from: 'in_progress',
    to: 'failed',
    condition: () => true,
  },
  // InProgress/Completed -> Expired: 超过截止时间
  {
    from: 'in_progress',
    to: 'expired',
    condition: (t: Task) => {
      if (!t.deadline) return false;
      return Date.now() > t.deadline.getTime();
    },
  },
];

// ==================== 状态机类 ====================

export class CampaignStateMachine {
  private campaign: Campaign;

  constructor(campaign: Campaign) {
    this.campaign = campaign;
  }

  /**
   * 获取当前状态
   */
  getStatus(): CampaignStatus {
    return this.campaign.status;
  }

  /**
   * 检查是否可以转换到目标状态
   */
  canTransition(to: CampaignStatus): boolean {
    const transition = campaignTransitions.find(
      t => t.from === this.campaign.status && t.to === to
    );
    
    if (!transition) return false;
    
    return transition.condition(this.campaign);
  }

  /**
   * 执行状态转换
   */
  async transition(to: CampaignStatus): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.canTransition(to)) {
      return {
        success: false,
        error: `Cannot transition from ${this.campaign.status} to ${to}`,
      };
    }

    const transition = campaignTransitions.find(
      t => t.from === this.campaign.status && t.to === to
    )!;

    try {
      // 执行转换动作
      if (transition.action) {
        await transition.action(this.campaign);
      }

      // 更新状态
      this.campaign.status = to;
      this.campaign.updatedAt = new Date();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 自动检查并执行可能的状态转换
   */
  async autoTransition(): Promise<{
    transitioned: boolean;
    from?: CampaignStatus;
    to?: CampaignStatus;
  }> {
    // 检查所有可能的目标状态
    for (const transition of campaignTransitions) {
      if (transition.from === this.campaign.status) {
        if (transition.condition(this.campaign)) {
          const from = this.campaign.status;
          const result = await this.transition(transition.to);
          
          if (result.success) {
            return {
              transitioned: true,
              from,
              to: transition.to,
            };
          }
        }
      }
    }

    return { transitioned: false };
  }
}

// ==================== 任务状态机 ====================

export class TaskStateMachine {
  private task: Task;

  constructor(task: Task) {
    this.task = task;
  }

  getStatus(): TaskStatus {
    return this.task.status;
  }

  canTransition(to: TaskStatus): boolean {
    const transition = taskTransitions.find(
      t => t.from === this.task.status && t.to === to
    );
    
    if (!transition) return false;
    
    return transition.condition(this.task);
  }

  async transition(to: TaskStatus): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.canTransition(to)) {
      return {
        success: false,
        error: `Cannot transition from ${this.task.status} to ${to}`,
      };
    }

    const transition = taskTransitions.find(
      t => t.from === this.task.status && t.to === to
    )!;

    try {
      if (transition.action) {
        await transition.action(this.task);
      }

      this.task.status = to;
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 检查任务是否满足完成条件
   */
  checkCompletion(): boolean {
    return taskTransitions
      .filter(t => t.from === 'in_progress' && t.to === 'completed')
      .some(t => t.condition(this.task));
  }
}

// ==================== 工具函数 ====================

/**
 * 创建新的Campaign
 */
export function createCampaign(
  advertiserId: string,
  budget: bigint,
  taskRequirements: Task['requirements'][]
): Campaign {
  const now = new Date();
  
  return {
    id: `camp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    advertiserId,
    status: 'pending',
    budget: {
      total: budget,
      spent: 0n,
      remaining: budget,
    },
    tasks: taskRequirements.map((req, index) => ({
      id: `task_${Date.now()}_${index}`,
      campaignId: `camp_${Date.now()}`, // 临时ID，会被覆盖
      status: 'pending',
      requirements: req,
      executions: [],
    })),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 验证执行是否满足任务要求
 */
export function validateExecution(
  task: Task,
  execution: Execution
): {
  valid: boolean;
  reason?: string;
} {
  // 检查执行类型是否被任务接受
  const allowedTypes: Execution['type'][] = [];
  
  if (task.requirements.pinnedPost) {
    allowedTypes.push('pinned_post');
  }
  if (task.requirements.groupAds && task.requirements.groupAds > 0) {
    allowedTypes.push('group_ad');
  }
  if (task.requirements.discussions && task.requirements.discussions > 0) {
    allowedTypes.push('discussion');
  }
  
  // 截图证明总是允许
  allowedTypes.push('screenshot');
  
  if (!allowedTypes.includes(execution.type)) {
    return {
      valid: false,
      reason: `Execution type ${execution.type} not required by task`,
    };
  }
  
  // 检查是否已存在相同类型的执行
  const existingCount = task.executions.filter(
    e => e.type === execution.type && e.status === 'verified'
  ).length;
  
  let requiredCount = 0;
  if (execution.type === 'group_ad') {
    requiredCount = task.requirements.groupAds || 0;
  } else if (execution.type === 'discussion') {
    requiredCount = task.requirements.discussions || 0;
  } else if (execution.type === 'pinned_post') {
    requiredCount = task.requirements.pinnedPost ? 1 : 0;
  }
  
  if (existingCount >= requiredCount) {
    return {
      valid: false,
      reason: `Already have ${existingCount} ${execution.type} executions, required: ${requiredCount}`,
    };
  }
  
  return { valid: true };
}
