'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Campaign {
  id: string;
  status: string;
  createdAt: string;
  config: {
    objective?: string;
    durationKey?: string;
    duration?: number;
    communityCount?: number;
  };
  communities?: { id: string }[];
  payment?: { totalAmount: string };
}

const DURATION_LABELS: Record<string, string> = {
  '1d': '1 Day', '1w': '1 Week', '1m': '1 Month',
};

function formatDuration(config: Campaign['config']): string {
  if (config.durationKey) return DURATION_LABELS[config.durationKey] ?? config.durationKey;
  if (config.duration === 1) return '1 Day';
  if (config.duration === 7) return '1 Week';
  if (config.duration === 30) return '1 Month';
  return config.duration ? `${config.duration}d` : '-';
}

function formatAmount(raw?: string): string {
  if (!raw) return '-';
  const usdt = Number(BigInt(raw)) / 1_000000;
  return `$${usdt.toLocaleString()} USDT`;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/campaigns?limit=50`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setCampaigns(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background-primary">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Campaigns</h1>
            <p className="text-text-secondary text-sm mt-1">Platform-wide campaign activity overview.</p>
          </div>
          <Link href="/campaigns/create" className="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-lg font-medium transition-colors">
            + Create Campaign
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-text-secondary">Loading campaigns...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12 bg-background-secondary rounded-lg border border-border">
            <p className="text-text-secondary mb-4">No campaigns yet</p>
            <Link href="/campaigns/create" className="text-primary hover:text-primary-light">
              Create your first campaign →
            </Link>
          </div>
        ) : (
          <div className="bg-background-secondary rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-background-tertiary">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-text-secondary">Campaign</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-text-secondary">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-text-secondary">Communities</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-text-secondary">Duration</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-text-secondary">Budget</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-text-secondary">Created</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-text-secondary"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.map((campaign) => (
                  <CampaignRow key={campaign.id} campaign={campaign} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const statusColors: Record<string, string> = {
    draft: 'bg-background-tertiary text-text-muted',
    pending: 'bg-accent/10 text-accent',
    active: 'bg-secondary/10 text-secondary',
    completed: 'bg-primary/10 text-primary',
    cancelled: 'bg-danger/10 text-danger',
  };

  const communityCount = campaign.config.communityCount ?? campaign.communities?.length ?? '-';
  const createdAt = new Date(campaign.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const isCompleted = campaign.status === 'completed';

  return (
    <tr className="hover:bg-background-tertiary transition-colors">
      <td className="px-6 py-4">
        <span className="font-medium text-text-primary capitalize">
          {Array.isArray(campaign.config.objective)
            ? campaign.config.objective.join(', ')
            : (campaign.config.objective ?? '—')}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusColors[campaign.status] ?? 'bg-border text-text-secondary'}`}>
          {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
        </span>
      </td>
      <td className="px-6 py-4 text-text-primary">{communityCount}</td>
      <td className="px-6 py-4 text-text-primary">{formatDuration(campaign.config)}</td>
      <td className="px-6 py-4 text-text-primary">{formatAmount(campaign.payment?.totalAmount)}</td>
      <td className="px-6 py-4 text-text-secondary text-sm">{createdAt}</td>
      <td className="px-6 py-4">
        <Link
          href={`/campaigns/${campaign.id}`}
          className={`text-sm font-medium transition-colors ${
            isCompleted
              ? 'text-primary hover:text-primary-dark underline'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          {isCompleted ? 'Rate →' : 'View →'}
        </Link>
      </td>
    </tr>
  );
}
