import cron from 'node-cron';
import { prisma } from '@ms/database';

/**
 * Compute promotion performance for a single active campaign
 * from its execution shillingData records.
 *
 * Called on-demand (e.g. when campaign detail page loads) and
 * also scheduled periodically to keep campaign.performance fresh.
 */
export async function aggregateCampaignPerformance(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      executions: {
        include: { community: { select: { memberCount: true } } },
      },
    },
  });

  if (!campaign) return;

  let totalPosts = 0;
  let totalPinDurationMs = 0;
  let totalReach = 0;
  let completedCount = 0;

  for (const exec of campaign.executions) {
    const data = (exec.shillingData ?? {}) as Record<string, unknown>;

    // Count ad posts (array)
    const ads = Array.isArray(data.group_ads) ? (data.group_ads as unknown[]).length : 0;
    // Count pinned post
    const hasPinned = !!data.pinnedAt;
    // Count discussions
    const discussions = Array.isArray(data.discussions) ? (data.discussions as unknown[]).length : 0;

    totalPosts += ads + (hasPinned ? 1 : 0) + discussions;

    // Pin duration: from pinnedAt to unpinnedAt (or now if still pinned)
    if (hasPinned) {
      const pinnedAt = new Date(data.pinnedAt as string).getTime();
      const unpinnedAt = data.unpinnedAt
        ? new Date(data.unpinnedAt as string).getTime()
        : Date.now();
      totalPinDurationMs += unpinnedAt - pinnedAt;
    }

    // Reach: sum member counts of communities with at least one execution action
    if (ads > 0 || hasPinned) {
      totalReach += exec.community?.memberCount ?? 0;
    }

    if (exec.status === 'completed') completedCount++;
  }

  const totalPinDurationHours = Math.round(totalPinDurationMs / 3600000);
  const totalCommunities = campaign.executions.length;

  // Preserve fields written by other processes (e.g. clicks from the redirect endpoint)
  const existingPerf = (typeof campaign.performance === 'object' && campaign.performance !== null
    ? campaign.performance : {}) as Record<string, unknown>;

  const performance = {
    ...existingPerf,
    totalPosts,
    totalPinDurationHours,
    totalReach,
    completedCommunities: completedCount,
    totalCommunities,
    completionRate: totalCommunities > 0 ? Math.round((completedCount / totalCommunities) * 100) : 0,
    lastUpdatedAt: new Date().toISOString(),
  };

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { performance: performance as any },
  });
}

/**
 * Aggregate performance for ALL active campaigns.
 */
async function aggregateAllActiveCampaigns(): Promise<void> {
  const active = await prisma.campaign.findMany({
    where: { status: 'active' },
    select: { id: true },
  });

  if (active.length === 0) return;

  console.log(`[PerfAgg] Aggregating performance for ${active.length} active campaign(s)…`);

  for (const { id } of active) {
    try {
      await aggregateCampaignPerformance(id);
    } catch (err) {
      console.error(`[PerfAgg] Failed for campaign ${id}:`, err);
    }
  }

  console.log(`[PerfAgg] Done.`);
}

/**
 * Start the periodic aggregation scheduler.
 *
 * Frequency is controlled by PERF_AGG_INTERVAL_HOURS env var (default 2).
 * Supported values: 1, 2, 4, 6 (hours).
 * Runs once immediately on startup, then on schedule.
 */
export function startPerformanceAggregator(): void {
  const intervalHours = parseInt(process.env.PERF_AGG_INTERVAL_HOURS || '2');
  const validIntervals: Record<number, string> = {
    1: '0 * * * *',
    2: '0 */2 * * *',
    4: '0 */4 * * *',
    6: '0 */6 * * *',
  };

  const schedule = validIntervals[intervalHours] ?? validIntervals[2];
  console.log(`[PerfAgg] Scheduler started — interval: every ${intervalHours}h (cron: ${schedule})`);

  // Run once shortly after startup to warm up performance data
  setTimeout(() => aggregateAllActiveCampaigns().catch(console.error), 10_000);

  cron.schedule(schedule, () => {
    aggregateAllActiveCampaigns().catch(console.error);
  });
}
