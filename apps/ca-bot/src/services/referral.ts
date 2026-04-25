import { Redis } from 'ioredis';

const redis = new Redis({
  host:      process.env.REDIS_HOST     ?? 'localhost',
  port:      parseInt(process.env.REDIS_PORT ?? '6379'),
  password:  process.env.REDIS_PASSWORD,
  keyPrefix: 'ca-bot:ref:',
  lazyConnect: true,
});
redis.on('error', (err) => console.warn('[Referral Redis]', err.message));

const TTL = 60 * 60 * 24 * 30; // 30 days

/**
 * Called when a user opens the bot via an invite link (before they register).
 * Stores referrerId so it can be claimed when the user completes registration.
 */
export async function setPendingReferrer(userId: number | string, referrerId: string): Promise<void> {
  try {
    await redis.set(`pending:${userId}`, referrerId, 'EX', TTL);
  } catch { /* Redis unavailable */ }
}

/**
 * Called at registration time. Links the new community to its referrer (if any).
 * Returns the referrerCommunityId if a pending referral existed.
 */
export async function claimReferral(userId: number | string, communityId: string): Promise<string | null> {
  try {
    const referrerId = await redis.get(`pending:${userId}`);
    if (!referrerId) return null;
    // Store permanent mapping: communityId → who referred them
    await redis.set(`by:${communityId}`, referrerId, 'EX', TTL * 12);
    await redis.del(`pending:${userId}`);
    return referrerId;
  } catch {
    return null;
  }
}

/**
 * Returns the referrer community ID for a given community (if exists).
 */
export async function getReferrer(communityId: string): Promise<string | null> {
  try {
    return await redis.get(`by:${communityId}`);
  } catch {
    return null;
  }
}

/**
 * Generates the invite deep link for a community owner to share.
 */
export function generateInviteLink(communityId: string, botUsername: string): string {
  return `https://t.me/${botUsername}?start=invite_${communityId}`;
}
