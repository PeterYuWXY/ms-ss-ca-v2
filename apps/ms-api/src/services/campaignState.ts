import { prisma } from '@ms/database';
import type { Campaign, CampaignStatus, CampaignExecution, ExecutionStatus } from '@ms/database';

// Campaign state transitions
const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ['pending', 'cancelled'],
  pending: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

// Task state transitions
const TASK_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  pending: ['accepted', 'rejected'],
  accepted: ['executing', 'completed'],
  rejected: [],
  executing: ['completed'],
  completed: [],
};

export class CampaignStateMachine {
  private campaignId: string;

  constructor(campaignId: string) {
    this.campaignId = campaignId;
  }

  async getState(): Promise<CampaignStatus | null> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: this.campaignId },
      select: { status: true },
    });
    return campaign?.status ?? null;
  }

  async canTransition(toStatus: CampaignStatus): Promise<boolean> {
    const currentStatus = await this.getState();
    if (!currentStatus) return false;
    return CAMPAIGN_TRANSITIONS[currentStatus]?.includes(toStatus) ?? false;
  }

  async transition(toStatus: CampaignStatus): Promise<Campaign> {
    const canTransition = await this.canTransition(toStatus);
    if (!canTransition) {
      const currentStatus = await this.getState();
      throw new Error(
        `Invalid transition from ${currentStatus} to ${toStatus}`
      );
    }

    return prisma.campaign.update({
      where: { id: this.campaignId },
      data: { status: toStatus },
    });
  }
}

export class TaskStateMachine {
  private execution: CampaignExecution;

  constructor(execution: CampaignExecution) {
    this.execution = execution;
  }

  get currentStatus(): ExecutionStatus {
    return this.execution.status;
  }

  canTransition(toStatus: ExecutionStatus): boolean {
    return TASK_TRANSITIONS[this.currentStatus]?.includes(toStatus) ?? false;
  }

  transition(toStatus: ExecutionStatus): { success: boolean; error?: string } {
    if (!this.canTransition(toStatus)) {
      return {
        success: false,
        error: `Invalid transition from ${this.currentStatus} to ${toStatus}`,
      };
    }
    return { success: true };
  }
}