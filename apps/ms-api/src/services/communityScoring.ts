import { prisma } from '@ms/database';

// ==================== Referral tier bonus ====================
// "Successful referral" = community they referred has ≥1 completed execution.
// Tiers are intentionally modest so completion rate + ratings dominate the score.

function referralBonus(count: number): number {
  if (count >= 21) return 5;
  if (count >= 11) return 4;
  if (count >= 6)  return 3;
  if (count >= 3)  return 2;
  if (count >= 1)  return 1;
  return 0;
}

// ==================== Core scoring formula ====================
// Max 100 pts:
//   memberScore    0–25   log scale so large groups don't dominate
//   completionScore 0–40  completed / accepted offers (quality signal)
//   ratingScore    0–20   avg advertiser rating / 5
//   recencyScore   0–10   days since last campaign (rotation fairness)
//   referralBonus  0–5    tiered on successful referrals

export async function computeCommunityScore(communityId: string): Promise<number> {
  const community = await prisma.community.findUnique({ where: { id: communityId } });
  if (!community) return 0;

  // ── memberScore (0–25) ─────────────────────────────────────────────────────
  // log10(x+1) / log10(200_001) * 25 → 200k members ≈ max
  const memberScore = Math.min(25,
    (Math.log10((community.memberCount ?? 0) + 1) / Math.log10(200_001)) * 25
  );

  // ── completionScore (0–40) ────────────────────────────────────────────────
  const [acceptedCount, completedCount] = await Promise.all([
    prisma.offer.count({ where: { communityId, status: { in: ['accepted', 'completed', 'failed'] } } }),
    prisma.offer.count({ where: { communityId, status: 'completed' } }),
  ]);
  const completionRate = acceptedCount > 0 ? completedCount / acceptedCount : 0.5; // neutral for new communities
  const completionScore = completionRate * 40;

  // ── ratingScore (0–20) ────────────────────────────────────────────────────
  const ratings = await prisma.communityRating.aggregate({
    where: { communityId },
    _avg: { engagement: true, relevance: true, quality: true, speed: true, professionalism: true },
    _count: { id: true },
  });
  let ratingScore: number;
  if (ratings._count.id === 0) {
    ratingScore = 12; // 60% of max for unrated communities
  } else {
    const avg = (
      (ratings._avg.engagement  ?? 0) +
      (ratings._avg.relevance   ?? 0) +
      (ratings._avg.quality     ?? 0) +
      (ratings._avg.speed       ?? 0) +
      (ratings._avg.professionalism ?? 0)
    ) / 5;
    ratingScore = (avg / 5) * 20;
  }

  // ── recencyScore (0–10) ───────────────────────────────────────────────────
  // Higher score = longer since last campaign → promotes fair rotation.
  // Communities with no history get max bonus (10).
  const lastOffer = await prisma.offer.findFirst({
    where: { communityId, status: { not: 'pending' } },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  });
  let recencyScore: number;
  if (!lastOffer) {
    recencyScore = 10; // brand-new, prioritise to get their first campaign
  } else {
    const daysSince = (Date.now() - lastOffer.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    recencyScore = Math.min(10, (daysSince / 60) * 10); // 60 days ≈ full recency bonus
  }

  // ── referralBonus (0–5) ───────────────────────────────────────────────────
  // Count communities referred by this one that have ≥1 completed execution.
  const successfulReferrals = await prisma.community.count({
    where: {
      referredBy: communityId,
      executions: { some: { status: 'completed' } },
    },
  });
  const refBonus = referralBonus(successfulReferrals);

  const total = memberScore + completionScore + ratingScore + recencyScore + refBonus;
  return Math.round(total * 10) / 10; // 1 decimal place
}

// ==================== Batch refresh ====================

export async function refreshAllScores(): Promise<void> {
  const communities = await prisma.community.findMany({
    where: { status: 'active' },
    select: { id: true },
  });

  // Refresh in chunks of 20 to avoid overwhelming the DB
  const CHUNK = 20;
  for (let i = 0; i < communities.length; i += CHUNK) {
    const chunk = communities.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async ({ id }) => {
        const score = await computeCommunityScore(id);
        // Also refresh denormalized referralCount
        const successfulReferrals = await prisma.community.count({
          where: {
            referredBy: id,
            executions: { some: { status: 'completed' } },
          },
        });
        await prisma.community.update({
          where: { id },
          data: { scoreCache: score, referralCount: successfulReferrals },
        });
      })
    );
  }
  console.log(`[CommunityScoring] Refreshed scores for ${communities.length} communities`);
}

// ==================== Matching query ====================
// Returns top (targetCount × overFactor) communities matching the filters,
// sorted by scoreCache desc. Default overFactor = 1.5.

export async function matchCommunities(opts: {
  tags?: string[];
  languages?: string[];
  targetCount: number;
  overFactor?: number;
}): Promise<{ id: string; ownerWallet: string; name: string; scoreCache: number }[]> {
  const { tags = [], languages = [], targetCount, overFactor = 1.5 } = opts;
  const take = Math.ceil(targetCount * overFactor);

  const where: any = { status: 'active' };
  if (tags.length > 0)      where.tags      = { hasSome: tags };
  if (languages.length > 0) where.language  = { hasSome: languages };

  const communities = await prisma.community.findMany({
    where,
    orderBy: { scoreCache: 'desc' },
    take,
    select: { id: true, ownerWallet: true, name: true, scoreCache: true },
  });

  return communities;
}
