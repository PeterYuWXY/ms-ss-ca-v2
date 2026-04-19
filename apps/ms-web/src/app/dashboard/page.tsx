'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { Header } from '@/components/Header';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface CampaignData {
  id: string;
  status: string;
  createdAt: string;
  config: {
    duration?: number;
    durationKey?: string;
    communityCount?: number;
    objective?: string;
  };
  communities?: { id: string }[];
  payment?: { totalAmount: string };
  _count?: { communities: number };
}

interface DashStats {
  totalSpentUsdt: number;
  activeCampaigns: number;
  totalCampaigns: number;
}

const DURATION_LABELS: Record<string, string> = {
  '1d': '1 Day', '1w': '1 Week', '1m': '1 Month',
};

function formatDuration(config: CampaignData['config']): string {
  if (config.durationKey) return DURATION_LABELS[config.durationKey] ?? config.durationKey;
  if (config.duration === 1) return '1 Day';
  if (config.duration === 7) return '1 Week';
  if (config.duration === 30) return '1 Month';
  return config.duration ? `${config.duration}d` : '-';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DashboardPage() {
  const { address } = useAccount();
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [stats, setStats] = useState<DashStats>({ totalSpentUsdt: 0, activeCampaigns: 0, totalCampaigns: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only fetch campaigns for the connected wallet address.
    // No wallet → all data stays at zero.
    if (!address) {
      setCampaigns([]);
      setStats({ totalSpentUsdt: 0, activeCampaigns: 0, totalCampaigns: 0 });
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/api/v1/campaigns?limit=10&advertiserId=${address}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        const list: CampaignData[] = d.data;
        setCampaigns(list);

        const totalSpentUsdt = list
          .filter((c) => c.payment?.totalAmount)
          .reduce((sum, c) => sum + Number(BigInt(c.payment!.totalAmount)) / 1_000_000, 0);

        setStats({
          totalSpentUsdt,
          activeCampaigns: list.filter((c) => c.status === 'active').length,
          totalCampaigns: d.pagination?.total ?? list.length,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  return (
    <div className="min-h-screen bg-background-primary">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <h1 className="text-2xl font-bold text-text-primary mb-6">My Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            title="Total Spent"
            value={loading ? '…' : `$${stats.totalSpentUsdt.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT`}
          />
          <StatCard
            title="Active Campaigns"
            value={loading ? '…' : String(stats.activeCampaigns)}
          />
          <StatCard
            title="Total Campaigns"
            value={loading ? '…' : String(stats.totalCampaigns)}
          />
        </div>

        {/* Quick Actions */}
        <div className="bg-background-secondary rounded-lg p-6 mb-8 border border-border">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
          <div className="flex gap-4">
            <Link
              href="/campaigns/create"
              className="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              + Create Campaign
            </Link>
            <Link
              href="/communities"
              className="bg-background-tertiary hover:bg-border text-text-primary px-6 py-3 rounded-lg font-medium transition-colors border border-border"
            >
              Browse Communities
            </Link>
          </div>
        </div>

        {/* UTM Tracking Tip */}
        {campaigns.some((c) => c.status === 'active' || c.status === 'completed') && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mb-8 flex gap-3">
            <span className="text-primary text-xl mt-0.5">📊</span>
            <div>
              <p className="text-text-primary font-medium text-sm">Track Your Campaign Conversions</p>
              <p className="text-text-secondary text-sm mt-1">
                Each community gets a unique UTM link — open any active campaign to copy per-community tracking URLs.
                Paste them into <span className="text-text-primary font-medium">Google Analytics → Reports → Acquisition → Traffic Acquisition</span> and
                filter by <span className="font-mono text-xs bg-background-tertiary px-1 py-0.5 rounded">utm_source=msp</span> to see clicks and conversions per community.
              </p>
            </div>
          </div>
        )}

        {/* Recent Campaigns */}
        <div className="bg-background-secondary rounded-lg border border-border">
          <div className="px-6 py-4 border-b border-border flex justify-between items-center">
            <h2 className="text-lg font-semibold text-text-primary">Recent Campaigns</h2>
            <Link href="/campaigns" className="text-primary hover:text-primary-light text-sm">
              View All →
            </Link>
          </div>

          <div className="divide-y divide-border">
            {loading ? (
              <p className="px-6 py-8 text-text-secondary text-sm text-center">Loading…</p>
            ) : campaigns.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-text-secondary text-sm mb-3">No campaigns yet.</p>
                <Link href="/campaigns/create" className="text-primary hover:text-primary-light text-sm underline">
                  Create your first campaign →
                </Link>
              </div>
            ) : (
              campaigns.map((c) => (
                <Link key={c.id} href={`/campaigns/${c.id}`} className="block hover:bg-background-tertiary/50 transition-colors">
                  <CampaignRow
                    name={Array.isArray(c.config.objective) ? c.config.objective.join(', ') : (c.config.objective ?? c.id)}
                    status={c.status as 'active' | 'completed' | 'pending' | 'draft' | 'cancelled'}
                    communities={c.config.communityCount ?? c._count?.communities ?? c.communities?.length ?? 0}
                    duration={formatDuration(c.config)}
                    createdAt={formatDate(c.createdAt)}
                  />
                </Link>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-background-secondary rounded-lg p-6 border border-border">
      <p className="text-text-secondary text-sm">{title}</p>
      <p className="text-2xl font-bold text-text-primary mt-2">{value}</p>
    </div>
  );
}

function CampaignRow({
  name,
  status,
  communities,
  duration,
  createdAt,
}: {
  name: string;
  status: 'active' | 'completed' | 'pending' | 'draft' | 'cancelled';
  communities: number;
  duration: string;
  createdAt: string;
}) {
  const statusColors: Record<string, string> = {
    active: 'bg-secondary/20 text-secondary',
    completed: 'bg-primary/20 text-primary',
    pending: 'bg-accent/20 text-accent',
    draft: 'bg-border text-text-secondary',
    cancelled: 'bg-danger/20 text-danger',
  };

  return (
    <div className="px-6 py-4 flex items-center justify-between">
      <div className="flex-1">
        <p className="font-medium text-text-primary capitalize">{name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${statusColors[status] ?? 'bg-border text-text-secondary'}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
          <span className="text-xs text-text-secondary">Created {createdAt}</span>
        </div>
      </div>
      <div className="flex gap-8 text-sm">
        <div className="text-center">
          <p className="text-text-secondary">Communities</p>
          <p className="text-text-primary font-medium">{communities}</p>
        </div>
        <div className="text-center">
          <p className="text-text-secondary">Duration</p>
          <p className="text-text-primary font-medium">{duration}</p>
        </div>
      </div>
    </div>
  );
}
