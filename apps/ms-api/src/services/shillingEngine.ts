import { prisma } from '@ms/database';
import type { Campaign, CampaignExecution, ShillingData } from '@ms/types';

/**
 * Shilling Skill Engine
 * Handles campaign execution validation and processing
 */

export interface ShillingRequirements {
  pinnedPost: boolean;
  groupAds: number;
  discussions: number;
}

export interface ShillingValidationResult {
  valid: boolean;
  score: number;
  missing: string[];
  details: {
    pinnedPost: boolean;
    groupAdsCount: number;
    discussionsCount: number;
  };
}

/**
 * Validate shilling execution against requirements
 */
export function validateShillingExecution(
  data: ShillingData,
  requirements: ShillingRequirements
): ShillingValidationResult {
  const missing: string[] = [];
  let score = 0;
  const maxScore = 100;

  // Check pinned post
  const hasPinnedPost = !!data.pinnedPost?.messageId;
  if (requirements.pinnedPost && !hasPinnedPost) {
    missing.push('Pinned post is required');
  }
  if (hasPinnedPost) {
    score += requirements.pinnedPost ? 30 : 10;
  }

  // Check group ads
  const groupAdsCount = data.groupAds?.length || 0;
  if (groupAdsCount < requirements.groupAds) {
    missing.push(`At least ${requirements.groupAds} group ads required (${groupAdsCount} found)`);
  }
  score += Math.min((groupAdsCount / Math.max(requirements.groupAds, 1)) * 30, 30);

  // Check discussions
  const discussionsCount = data.discussions?.length || 0;
  if (discussionsCount < requirements.discussions) {
    missing.push(`At least ${requirements.discussions} discussions required (${discussionsCount} found)`);
  }
  score += Math.min((discussionsCount / Math.max(requirements.discussions, 1)) * 40, 40);

  return {
    valid: missing.length === 0,
    score: Math.min(Math.round(score), maxScore),
    missing,
    details: {
      pinnedPost: hasPinnedPost,
      groupAdsCount,
      discussionsCount
    }
  };
}

/**
 * Process campaign completion and distribute payments
 */
export async function processCampaignCompletion(campaignId: string): Promise<{
  success: boolean;
  message: string;
  completedExecutions: number;
} > {
  try {
    // Get campaign with executions
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        executions: {
          include: {
            community: true,
            ca: true
          }
        },
        payment: true
      }
    });

    if (!campaign) {
      return { success: false, message: 'Campaign not found', completedExecutions: 0 };
    }

    if (campaign.status === 'completed') {
      return { success: false, message: 'Campaign already completed', completedExecutions: 0 };
    }

    // Validate all executions
    let completedCount = 0;
    const validatedExecutions: Array<{
      executionId: string;
      caWallet: string;
      score: number;
      reward: bigint;
    }> = [];

    for (const execution of campaign.executions) {
      const shillingData = ((execution.shillingData || {}) as unknown) as ShillingData;
      const requirements = (campaign.config as any)?.requirements || {
        pinnedPost: true,
        groupAds: 3,
        discussions: 2
      };

      const validation = validateShillingExecution(shillingData, requirements);

      if (validation.valid && validation.score >= 70) {
        completedCount++;
        
        // Calculate reward based on score
        const totalReward = BigInt(campaign.payment?.caReward || '0');
        const reward = (totalReward * BigInt(validation.score)) / BigInt(100);
        
        validatedExecutions.push({
          executionId: execution.id,
          caWallet: execution.ca?.ownerWallet || '',
          score: validation.score,
          reward
        });

        // Update execution status
        await prisma.campaignExecution.update({
          where: { id: execution.id },
          data: { status: 'completed' }
        });
      }
    }

    // Update campaign status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { 
        status: 'completed',
        timeline: {
          ...(campaign.timeline as object || {}),
          completedAt: new Date().toISOString()
        }
      }
    });

    return {
      success: true,
      message: `Campaign completed with ${completedCount} valid executions`,
      completedExecutions: completedCount
    };

  } catch (error) {
    console.error('Error processing campaign completion:', error);
    return {
      success: false,
      message: 'Failed to process campaign completion',
      completedExecutions: 0
    };
  }
}

/**
 * Generate shilling report for an execution
 */
export function generateShillingReport(
  execution: CampaignExecution,
  requirements: ShillingRequirements
): {
  summary: string;
  details: Record<string, any>;
  score: number;
  recommendations: string[];
} {
  const shillingData = ((execution.shillingData || {}) as unknown) as ShillingData;
  const validation = validateShillingExecution(shillingData, requirements);
  
  const recommendations: string[] = [];
  
  if (!validation.details.pinnedPost && requirements.pinnedPost) {
    recommendations.push('Add a pinned post to increase visibility');
  }
  
  if (validation.details.groupAdsCount < requirements.groupAds) {
    recommendations.push(`Post ${requirements.groupAds - validation.details.groupAdsCount} more group ads`);
  }
  
  if (validation.details.discussionsCount < requirements.discussions) {
    recommendations.push(`Initiate ${requirements.discussions - validation.details.discussionsCount} more discussions`);
  }

  return {
    summary: validation.valid 
      ? `Execution completed with score ${validation.score}/100`
      : `Execution incomplete: ${validation.missing.join(', ')}`,
    details: {
      executionId: execution.id,
      status: execution.status,
      shillingData: execution.shillingData,
      validation: validation.details
    },
    score: validation.score,
    recommendations
  };
}

/**
 * Calculate CA reputation score based on execution history
 */
export async function calculateCAReputation(caId: string): Promise<{
  score: number;
  totalExecutions: number;
  avgValidationScore: number;
  completionRate: number;
}> {
  try {
    const executions = await prisma.campaignExecution.findMany({
      where: { caId }
    });

    if (executions.length === 0) {
      return {
        score: 0,
        totalExecutions: 0,
        avgValidationScore: 0,
        completionRate: 0
      };
    }

    const completedExecutions = executions.filter(e => e.status === 'completed');
    const completionRate = completedExecutions.length / executions.length;

    // Calculate average validation score
    let totalScore = 0;
    for (const execution of completedExecutions) {
      const shillingData = ((execution.shillingData || {}) as unknown) as ShillingData;
      const validation = validateShillingExecution(shillingData, {
        pinnedPost: true,
        groupAds: 3,
        discussions: 2
      });
      totalScore += validation.score;
    }

    const avgValidationScore = completedExecutions.length > 0 
      ? totalScore / completedExecutions.length 
      : 0;

    // Overall reputation score (0-100)
    const score = Math.round(
      (completionRate * 40) + 
      (avgValidationScore * 0.6)
    );

    return {
      score: Math.min(score, 100),
      totalExecutions: executions.length,
      avgValidationScore: Math.round(avgValidationScore),
      completionRate: Math.round(completionRate * 100)
    };

  } catch (error) {
    console.error('Error calculating CA reputation:', error);
    return {
      score: 0,
      totalExecutions: 0,
      avgValidationScore: 0,
      completionRate: 0
    };
  }
}
