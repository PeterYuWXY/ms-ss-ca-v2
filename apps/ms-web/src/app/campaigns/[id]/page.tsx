'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Header } from '@/components/Header';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ==================== Types ====================

interface ShillingData {
  pinned_post?: { messageId?: number; timestamp?: string };
  pinnedAt?: string;
  group_ads?: Array<{ messageId?: number; timestamp?: string }>;
  discussions?: Array<{ messageId?: number; timestamp?: string }>;
  unpinnedAt?: string;
  statusUpdatedAt?: string;
}

interface ExecutionDetail {
  id: string;
  status: string;
  communityId: string;
  shillingData?: ShillingData;
}

interface CampaignDetail {
  id: string;
  status: string;
  config: {
    objective?: string;
    durationKey?: string;
    duration?: number;
    communityCount?: number;
    targetUrl?: string;
    promoteContent?: { landingUrl?: string; contentUrl?: string; adCopy?: string };
  };
  createdAt: string;
  communities: { id: string; status: string; community: { id: string; name: string; memberCount: number } }[];
  executions: ExecutionDetail[];
  performance?: { clicks?: Record<string, number>; [key: string]: unknown };
  payment?: {
    totalAmount: string;
    platformFee: string;
    caReward: string;
    status: string;
    txHash?: string;
    paidAt?: string;
  };
}

interface RatingDimension {
  key: 'engagement' | 'relevance' | 'quality' | 'speed' | 'professionalism';
  label: string;
}

const RATING_DIMENSIONS: RatingDimension[] = [
  { key: 'engagement', label: 'Engagement' },
  { key: 'relevance', label: 'Relevance' },
  { key: 'quality', label: 'Quality' },
  { key: 'speed', label: 'Speed' },
  { key: 'professionalism', label: 'Professionalism' },
];

const DURATION_DAYS: Record<string, number> = { '1d': 1, '1w': 7, '2w': 14, '4w': 28, '1m': 30 };

// ==================== Helpers ====================

function msDuration(from: string, to?: string): number {
  return (to ? new Date(to) : new Date()).getTime() - new Date(from).getTime();
}

function formatMs(ms: number): string {
  const h = Math.round(ms / 3600000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h`;
}

/** Redirect URL that records a click then forwards to the target URL with UTM params. */
function buildTrackingUrl(campaignId: string, communityId: string): string {
  return `${API_BASE}/r/${campaignId}/${communityId}`;
}

// ==================== Duration Progress ====================

function DurationProgress({ campaign }: { campaign: CampaignDetail }) {
  const durationKey = campaign.config.durationKey ?? '1w';
  const durationDays = DURATION_DAYS[durationKey] ?? (campaign.config.duration ?? 7);
  const startMs = campaign.payment?.paidAt
    ? new Date(campaign.payment.paidAt).getTime()
    : new Date(campaign.createdAt).getTime();
  const endMs = startMs + durationDays * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - startMs;
  const total = endMs - startMs;
  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
  const pctDisplay = pct < 1 ? '<1' : Math.round(pct).toString();
  // Always show at least a 3px sliver so the bar looks started even on day 1
  const barWidth = pct > 0 ? `max(3px, ${pct}%)` : '0%';
  const daysLeft = Math.max(0, Math.ceil((endMs - Date.now()) / 86400000));
  const fmt = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div>
      <div className="flex justify-between text-sm text-text-secondary mb-1">
        <span>Duration Progress</span>
        <span>{pctDisplay}% elapsed{campaign.status === 'active' ? ` · ${daysLeft}d left` : ''}</span>
      </div>
      <div className="w-full bg-background-tertiary rounded-full h-2 overflow-hidden">
        <div className="bg-secondary rounded-full h-2 transition-all" style={{ width: barWidth }} />
      </div>
      <div className="flex justify-between text-xs text-text-secondary mt-1">
        <span>Start: {fmt(startMs)}</span>
        <span>End: {fmt(endMs)}</span>
      </div>
    </div>
  );
}

// ==================== Campaign Summary Metrics ====================

function CampaignSummary({ campaign }: { campaign: CampaignDetail }) {
  const executionsByComm = new Map<string, ExecutionDetail>();
  for (const exec of campaign.executions) executionsByComm.set(exec.communityId, exec);

  const totalReach = campaign.communities.reduce((sum, { community }) => sum + community.memberCount, 0);

  const totalPosts = campaign.communities.reduce((sum, { community }) => {
    const exec = executionsByComm.get(community.id);
    return sum + (exec?.shillingData?.group_ads?.length ?? 0);
  }, 0);

  const totalPinMs = campaign.communities.reduce((sum, { community }) => {
    const exec = executionsByComm.get(community.id);
    const sd = exec?.shillingData;
    const pinnedTs = sd?.pinned_post?.timestamp ?? sd?.pinnedAt;
    if (!pinnedTs) return sum;
    return sum + msDuration(pinnedTs, sd?.unpinnedAt);
  }, 0);

  const totalClicks = Object.values(campaign.performance?.clicks ?? {}).reduce((s, n) => s + n, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      <SummaryCard
        label="Total Ads Published"
        value={totalPosts > 0 ? `${totalPosts}` : '—'}
        sub={`across ${campaign.communities.length} communities`}
      />
      <SummaryCard
        label="Total Pin Duration"
        value={totalPinMs > 0 ? formatMs(totalPinMs) : '—'}
        sub="combined across communities"
      />
      <SummaryCard
        label="Total Est. Reach"
        value={totalReach.toLocaleString()}
        sub="sum of community members"
      />
      <SummaryCard
        label="Tracking Link Clicks"
        value={totalClicks > 0 ? totalClicks.toLocaleString() : '—'}
        sub="via platform redirect links"
      />
    </div>
  );
}

function SummaryCard({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-4 border ${highlight ? 'border-accent/50 bg-accent/5' : 'border-border bg-background-secondary'}`}>
      <p className="text-text-secondary text-xs mb-1">{label}</p>
      <p className="text-xl font-bold text-text-primary">{value}</p>
      <p className="text-text-secondary text-xs mt-1">{sub}</p>
    </div>
  );
}

// ==================== Spider Chart ====================

function SpiderChart({ scores }: { scores: Record<string, number> }) {
  const size = 200;
  const cx = size / 2, cy = size / 2, r = 70;
  const n = RATING_DIMENSIONS.length;

  const axes = RATING_DIMENSIONS.map((d, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { label: d.label, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), lx: cx + (r + 20) * Math.cos(angle), ly: cy + (r + 20) * Math.sin(angle) };
  });

  const gridPolygons = [0.2, 0.4, 0.6, 0.8, 1.0].map((level) =>
    RATING_DIMENSIONS.map((_, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      return `${cx + r * level * Math.cos(angle)},${cy + r * level * Math.sin(angle)}`;
    }).join(' ')
  );

  const dataPoints = RATING_DIMENSIONS.map((d, i) => {
    const value = (scores[d.key] ?? 0) / 5;
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return `${cx + r * value * Math.cos(angle)},${cy + r * value * Math.sin(angle)}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-xs mx-auto">
      {gridPolygons.map((pts, i) => <polygon key={i} points={pts} fill="none" stroke="#334155" strokeWidth="0.5" />)}
      {axes.map((ax) => <line key={ax.label} x1={cx} y1={cy} x2={ax.x} y2={ax.y} stroke="#475569" strokeWidth="0.5" />)}
      <polygon points={dataPoints} fill="rgba(139,92,246,0.3)" stroke="#8b5cf6" strokeWidth="1.5" />
      {axes.map((ax) => <text key={ax.label} x={ax.lx} y={ax.ly} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#94a3b8">{ax.label}</text>)}
    </svg>
  );
}

// ==================== Rating Form ====================

function RatingForm({ communityId, communityName, campaignId, advertiserId, onSubmitted }: {
  communityId: string; communityName: string; campaignId: string; advertiserId: string; onSubmitted: () => void;
}) {
  const [scores, setScores] = useState<Record<string, number>>({ engagement: 3, relevance: 3, quality: 3, speed: 3, professionalism: 3 });
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/campaigns/${campaignId}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advertiserId, communityId, ...scores, comment }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSubmitted();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to submit'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="bg-background-tertiary rounded-lg p-4 mt-4">
      <h4 className="font-medium text-text-primary mb-3">Rate: {communityName}</h4>
      <div className="space-y-3">
        {RATING_DIMENSIONS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-text-secondary text-sm w-36">{label}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} onClick={() => setScores((s) => ({ ...s, [key]: v }))}
                  className={`w-8 h-8 rounded text-sm font-medium transition-colors ${scores[key] >= v ? 'bg-primary text-white' : 'bg-background-secondary text-text-secondary hover:bg-border'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <textarea className="w-full mt-3 bg-background-secondary border border-border rounded p-2 text-text-primary text-sm resize-none"
        placeholder="Optional comment..." rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p className="text-danger text-sm mt-1">{error}</p>}
      <div className="mt-3"><SpiderChart scores={scores} /></div>
      <button onClick={handleSubmit} disabled={submitting}
        className="mt-3 w-full bg-primary hover:bg-primary-dark text-white py-2 rounded font-medium text-sm disabled:opacity-50">
        {submitting ? 'Submitting...' : 'Submit Rating'}
      </button>
    </div>
  );
}

// ==================== Per-community execution row ====================

function CommunityExecutionRow({ community, exec, campaignId, targetUrl, clicks, canRate, hasRating, isRating, onToggleRate, onRated, address, ratings }: {
  community: { id: string; name: string; memberCount: number };
  exec?: ExecutionDetail;
  campaignId: string;
  targetUrl?: string;
  clicks: number;
  canRate: boolean;
  hasRating: boolean;
  isRating: boolean;
  onToggleRate: () => void;
  onRated: () => void;
  address?: string;
  ratings: Record<string, number>;
}) {
  const [copied, setCopied] = useState(false);
  const sd = exec?.shillingData;
  const execStatus = exec?.status ?? 'pending';

  const postsSent = sd?.group_ads?.length ?? 0;
  const pinnedTs = sd?.pinned_post?.timestamp ?? sd?.pinnedAt;
  const pinDuration = pinnedTs ? formatMs(msDuration(pinnedTs, sd?.unpinnedAt)) : '—';

  const trackingUrl = buildTrackingUrl(campaignId, community.id);
  const hasRealUrl = !!(targetUrl ?? (exec as any)?.promoteContent?.landingUrl);

  const execColor: Record<string, string> = {
    completed: 'text-secondary', executing: 'text-accent',
    accepted: 'text-primary', pending: 'text-text-secondary', rejected: 'text-danger',
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(trackingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="px-6 py-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-medium text-text-primary">{community.name}</p>
          <p className="text-text-secondary text-xs mt-0.5">{community.memberCount.toLocaleString()} members</p>
        </div>
        <div className="flex items-center gap-4">
          <span className={`text-sm font-medium capitalize ${execColor[execStatus] ?? 'text-text-secondary'}`}>{execStatus}</span>
          {canRate && !hasRating && (
            <button onClick={onToggleRate} className="text-primary hover:text-primary-light text-sm underline">
              {isRating ? 'Cancel' : 'Rate'}
            </button>
          )}
          {hasRating && <span className="text-text-secondary text-sm">Rated ✓</span>}
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-3">
        <div className="bg-background-primary rounded p-2 text-center">
          <p className="text-text-secondary text-xs">Ads Posted</p>
          <p className="text-text-primary font-semibold mt-0.5">{postsSent > 0 ? postsSent : '—'}</p>
        </div>
        <div className="bg-background-primary rounded p-2 text-center">
          <p className="text-text-secondary text-xs">Pin Duration</p>
          <p className="text-text-primary font-semibold mt-0.5">{pinDuration}</p>
        </div>
        <div className="bg-background-primary rounded p-2 text-center">
          <p className="text-text-secondary text-xs">Est. Reach</p>
          <p className="text-text-primary font-semibold mt-0.5">{community.memberCount.toLocaleString()}</p>
        </div>
        <div className="bg-background-primary rounded p-2 text-center">
          <p className="text-text-secondary text-xs">Link Clicks</p>
          <p className={`font-semibold mt-0.5 ${clicks > 0 ? 'text-secondary' : 'text-text-secondary'}`}>
            {clicks > 0 ? clicks : '—'}
          </p>
        </div>
      </div>

      {/* Tracking redirect link */}
      <div className={`rounded p-2 flex items-center gap-2 ${hasRealUrl ? 'bg-background-primary' : 'bg-accent/5 border border-accent/20'}`}>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-secondary truncate font-mono">{trackingUrl}</p>
          {!hasRealUrl && <p className="text-xs text-accent mt-0.5">No landing URL — clicks are counted but not redirected</p>}
        </div>
        <button onClick={handleCopy}
          className="shrink-0 text-xs text-primary hover:text-primary-light font-medium px-2 py-1 rounded bg-background-secondary border border-border">
          {copied ? '✓' : 'Copy'}
        </button>
      </div>

      {/* Rating form */}
      {isRating && address && (
        <RatingForm communityId={community.id} communityName={community.name} campaignId={campaignId}
          advertiserId={address} onSubmitted={onRated} />
      )}
      {hasRating && (
        <div className="mt-3 max-w-xs"><SpiderChart scores={ratings} /></div>
      )}
    </div>
  );
}

// ==================== Main Page ====================

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { address } = useAccount();

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [ratings, setRatings] = useState<Record<string, Record<string, number>>>({});
  const [ratingCommunityId, setRatingCommunityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/api/v1/campaigns/${id}`).then((r) => r.json()),
      fetch(`${API_BASE}/api/v1/campaigns/${id}/ratings`).then((r) => r.json()),
    ])
      .then(([campData, ratingsData]) => {
        if (campData.success) setCampaign(campData.data);
        if (ratingsData.success) {
          const map: Record<string, Record<string, number>> = {};
          for (const r of ratingsData.data ?? []) map[r.communityId] = r;
          setRatings(map);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-background-primary flex items-center justify-center">
      <p className="text-text-secondary">Loading campaign...</p>
    </div>
  );

  if (!campaign) return (
    <div className="min-h-screen bg-background-primary flex items-center justify-center">
      <p className="text-text-secondary">Campaign not found.</p>
    </div>
  );

  const executionsByComm = new Map<string, ExecutionDetail>();
  for (const exec of campaign.executions) executionsByComm.set(exec.communityId, exec);

  const completedCount = campaign.executions.filter((e) => e.status === 'completed').length;
  const inProgressCount = campaign.executions.filter((e) => ['accepted', 'executing'].includes(e.status)).length;
  const totalCount = campaign.communities.length;
  const completedPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const inProgressPct = totalCount > 0 ? (inProgressCount / totalCount) * 100 : 0;
  const canRate = campaign.status === 'completed' && !!address;

  const statusColor: Record<string, string> = {
    active: 'text-secondary bg-secondary/20', completed: 'text-primary bg-primary/20',
    pending: 'text-accent bg-accent/20', draft: 'text-text-secondary bg-border', cancelled: 'text-danger bg-danger/20',
  };

  const paymentStatusLabel = (status: string) => {
    if (status === 'paid') return { label: 'Locked in MS Vault', color: 'text-accent' };
    if (status === 'released') return { label: 'Paid to Communities', color: 'text-secondary' };
    return { label: status.charAt(0).toUpperCase() + status.slice(1), color: 'text-text-secondary' };
  };

  const fmtUsdt = (raw: string) => `$${(Number(BigInt(raw)) / 1_000_000).toLocaleString()} USDT`;

  return (
    <div className="min-h-screen bg-background-primary">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Campaign summary metrics */}
        <CampaignSummary campaign={campaign} />

        {/* Status + Payment */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-background-secondary border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Campaign Status</h2>
            <div className="flex items-center gap-3 mb-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor[campaign.status] ?? 'text-text-secondary bg-border'}`}>
                {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
              </span>
              <span className="text-text-secondary text-sm">Created {new Date(campaign.createdAt).toLocaleDateString()}</span>
            </div>

            {/* Completion progress */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-text-secondary mb-1">
                <span>Completion Progress</span>
                <span>{completedCount} done · {inProgressCount} active / {totalCount}</span>
              </div>
              <div className="w-full bg-background-tertiary rounded-full h-2 relative overflow-hidden">
                {/* In-progress layer (behind completed) */}
                {inProgressPct + completedPct > 0 && (
                  <div
                    className="absolute left-0 top-0 h-2 bg-primary/30 rounded-full transition-all"
                    style={{ width: `max(3px, ${completedPct + inProgressPct}%)` }}
                  />
                )}
                {/* Completed layer */}
                {completedPct > 0 && (
                  <div
                    className="absolute left-0 top-0 h-2 bg-primary rounded-full transition-all"
                    style={{ width: `${completedPct}%` }}
                  />
                )}
              </div>
              <div className="flex justify-end gap-3 mt-1 text-xs text-text-secondary">
                {inProgressCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-primary/40" />
                    In progress
                  </span>
                )}
                {completedCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-primary" />
                    Completed
                  </span>
                )}
              </div>
            </div>

            {/* Duration progress */}
            <DurationProgress campaign={campaign} />
          </div>

          <div className="bg-background-secondary border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Payment</h2>
            {campaign.payment ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Total</dt>
                  <dd className="text-text-primary font-medium">{fmtUsdt(campaign.payment.totalAmount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Platform Fee</dt>
                  <dd className="text-text-primary">{fmtUsdt(campaign.payment.platformFee)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Community Charge</dt>
                  <dd className="text-secondary font-medium">{fmtUsdt(campaign.payment.caReward)}</dd>
                </div>
                <div className="flex justify-between pt-2 border-t border-border">
                  <dt className="text-text-secondary">Payment Status</dt>
                  <dd className={`${paymentStatusLabel(campaign.payment.status).color} font-medium`}>
                    {paymentStatusLabel(campaign.payment.status).label}
                  </dd>
                </div>
                {campaign.payment.txHash && (
                  <div className="flex justify-between">
                    <dt className="text-text-secondary">Tx Hash</dt>
                    <dd className="text-primary font-mono text-xs truncate max-w-40">{campaign.payment.txHash}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-text-secondary text-sm">No payment record yet.</p>
            )}
          </div>
        </div>

        {/* Communities + execution details */}
        <div className="bg-background-secondary border border-border rounded-lg mb-6">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Communities & Execution</h2>
            {canRate && <span className="text-sm text-text-secondary">Click Rate to review a community</span>}
          </div>
          <div className="divide-y divide-border">
            {campaign.communities.map(({ community }) => (
              <CommunityExecutionRow
                key={community.id}
                community={community}
                exec={executionsByComm.get(community.id)}
                campaignId={id}
                targetUrl={campaign.config.targetUrl ?? campaign.config.promoteContent?.landingUrl}
                clicks={campaign.performance?.clicks?.[community.id] ?? 0}
                canRate={canRate}
                hasRating={!!ratings[community.id]}
                isRating={ratingCommunityId === community.id}
                onToggleRate={() => setRatingCommunityId(community.id === ratingCommunityId ? null : community.id)}
                onRated={() => { setRatingCommunityId(null); fetchData(); }}
                address={address}
                ratings={ratings[community.id] ?? {}}
              />
            ))}
          </div>
        </div>

        {/* Tracking guide */}
        <div className="bg-background-secondary border border-border rounded-lg p-5 text-sm">
          <p className="font-semibold text-text-primary mb-2">How click tracking works</p>
          <ol className="list-decimal list-inside space-y-1 text-text-secondary">
            <li>Each community has a unique <strong className="text-text-primary">tracking link</strong> — copy it and share it anywhere (Telegram, Twitter, etc.).</li>
            <li>Every click on the link is counted in <strong className="text-text-primary">Link Clicks</strong> above, then the user is redirected to your landing URL with UTM params.</li>
            <li>For deeper funnel data, open <strong className="text-text-primary">Google Analytics → Acquisition → Traffic Acquisition</strong> and filter by <span className="font-mono text-xs bg-background-tertiary px-1 rounded">utm_source=msp</span>.</li>
          </ol>
          {!(campaign.config.targetUrl ?? campaign.config.promoteContent?.landingUrl) && (
            <p className="mt-3 text-accent text-xs">
              No landing URL was set for this campaign — clicks are counted but users won't be redirected. Add a landing URL on your next campaign.
            </p>
          )}
        </div>

      </main>
    </div>
  );
}
