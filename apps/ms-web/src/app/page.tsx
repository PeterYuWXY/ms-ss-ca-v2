'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Community {
  id: string;
  name: string;
  description?: string;
  platform: string;
  memberCount: number;
  language: string[];
  category: string;
  tags: string[];
  caBotId?: string;
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English', zh: 'Chinese', es: 'Spanish',  ru: 'Russian',
  ko: 'Korean',  ja: 'Japanese', tr: 'Turkish', ar: 'Arabic', pt: 'Portuguese',
};

export default function HomePage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<'members' | 'rating' | 'activity'>('members');

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/communities?limit=50&sortBy=${sortBy}`)
      .then((r) => r.json())
      .then(async (d) => {
        if (!d.success) return;
        // Enrich with average ratings
        const enriched = await Promise.all(
          (d.data as Community[]).map(async (c) => {
            try {
              // We'd need a community-level rating endpoint; for now derive from campaigns
              return c;
            } catch {
              return c;
            }
          })
        );
        setCommunities(enriched);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sortBy]);

  const filtered = communities.filter((c) => {
    const q = filter.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q)) ||
      c.language.some((l) => (LANGUAGE_LABELS[l] ?? l).toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-background-primary">
      <Header />

      {/* Hero */}
      <section className="bg-background-secondary border-b border-border py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-extrabold text-text-primary mb-4 leading-tight">
            Marketing Skill Platform
          </h1>
          <p className="text-xl text-text-secondary mb-8 max-w-2xl mx-auto">
            The decentralized marketplace connecting crypto projects with vetted Telegram communities.
            Pay in USDT, settle on-chain, verified by smart contract.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/campaigns/create"
              className="bg-primary hover:bg-primary-dark text-white px-8 py-4 rounded-lg font-bold text-lg transition-colors shadow-lg"
            >
              Create Marketing Campaign
            </Link>
            <Link
              href="/become-ca"
              className="bg-background-tertiary hover:bg-border text-text-primary px-8 py-4 rounded-lg font-semibold text-lg transition-colors border border-border"
            >
              Claim a Bot
            </Link>
          </div>
        </div>
      </section>

      {/* Community Marketplace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h2 className="text-2xl font-bold text-text-primary">Community Marketplace</h2>
          <div className="flex gap-3 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search by name, tag, language…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="flex-1 sm:w-64 px-4 py-2 bg-background-secondary border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary text-sm"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-3 py-2 bg-background-secondary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary"
            >
              <option value="members">Sort: Members</option>
              <option value="rating">Sort: Rating</option>
              <option value="activity">Sort: Activity</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-background-secondary border border-border rounded-lg p-6 animate-pulse h-64" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-background-secondary rounded-xl border border-border">
            <p className="text-text-secondary text-lg mb-2">No communities listed yet</p>
            <p className="text-text-secondary text-sm">
              Telegram group owners can{' '}
              <Link href="/become-ca" className="text-primary underline">Claim a Bot</Link>
              {' '}to join the marketplace.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((c) => (
              <CommunityCard key={c.id} community={c} />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-10 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <p className="text-text-primary font-bold text-lg">Marketing Skill Platform</p>
            <p className="text-text-secondary text-sm mt-1">Decentralized crypto marketing, powered by smart contracts.</p>
          </div>
          <div className="text-center md:text-right">
            <p className="text-text-secondary text-sm mb-1">Contact / Partnership</p>
            <a href="mailto:dosiralphasniper@gmail.com" className="text-primary hover:text-primary-light text-sm font-medium">
              dosiralphasniper@gmail.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CommunityCard({ community }: { community: Community }) {
  const langs = (community.language ?? []).map((l) => LANGUAGE_LABELS[l] ?? l);
  const tgLink = community.caBotId
    ? `https://t.me/${community.caBotId.replace(/^-100/, '')}`
    : null;

  return (
    <div className="bg-background-secondary rounded-xl border border-border hover:border-primary/50 transition-all hover:shadow-lg p-6 flex flex-col gap-4">
      {/* Name + TG link */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 mr-2">
          <h3 className="text-lg font-bold text-text-primary truncate">{community.name}</h3>
          {community.description && (
            <p className="text-text-secondary text-sm mt-0.5 line-clamp-2">{community.description}</p>
          )}
        </div>
        {tgLink && (
          <a
            href={tgLink}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Telegram"
            className="shrink-0 text-primary hover:text-primary-light"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
            </svg>
          </a>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-text-secondary text-xs">Members</p>
          <p className="text-text-primary font-semibold">{community.memberCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-text-secondary text-xs">Language</p>
          <p className="text-text-primary font-semibold truncate">{langs.join(', ') || '—'}</p>
        </div>
      </div>

      {/* Tags (from library, max 3) */}
      {(community.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(community.tags ?? []).slice(0, 3).map((tag) => (
            <span key={tag} className="px-2 py-0.5 bg-primary/10 border border-primary/30 rounded-full text-xs text-primary font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Category / platform footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-text-secondary">
        <span className="capitalize">{community.category || 'general'}</span>
        <span className="capitalize">{community.platform}</span>
      </div>
    </div>
  );
}
