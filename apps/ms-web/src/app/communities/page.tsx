'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const TAG_LIBRARY = ['RWA', 'Trading', 'DeFi', 'Prediction', 'Alpha', 'NFT', 'GameFi', 'Layer2', 'AI', 'Meme'] as const;

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English', zh: 'Chinese', es: 'Spanish', ru: 'Russian',
  ko: 'Korean',  ja: 'Japanese', tr: 'Turkish', ar: 'Arabic', pt: 'Portuguese',
  vi: 'Vietnamese',
};

interface Community {
  id: string;
  name: string;
  platform: string;
  memberCount: number;
  language: string[];
  tags: string[];
  telegramHandle?: string;
  caBotId?: string;
  status: string;
}

const LANGUAGE_TABS: { value: string; label: string }[] = [
  { value: '',   label: 'All'        },
  { value: 'zh', label: 'Chinese'    },
  { value: 'en', label: 'English'    },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'ko', label: 'Korean'     },
];

interface PlatformStats {
  totalCommunities: number;
  totalMembers: number;
  updatedAt: string;
}

const STATS_CACHE_KEY = 'ms_communities_stats';
const STATS_TTL_MS = 24 * 60 * 60 * 1000;

function loadCachedStats(): PlatformStats | null {
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY);
    if (!raw) return null;
    const parsed: PlatformStats = JSON.parse(raw);
    if (Date.now() - new Date(parsed.updatedAt).getTime() > STATS_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function saveStatsCache(stats: PlatformStats) {
  try { localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(stats)); } catch { }
}

function formatMembers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState('');
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    const cached = loadCachedStats();
    if (cached) setStats(cached);
  }, []);

  useEffect(() => {
    setLoading(true);
    // Always sort by members desc (API default)
    const params = new URLSearchParams({ limit: '200', sortBy: 'members' });
    if (activeTag)  params.set('tag',      activeTag);
    if (activeLang) params.set('language', activeLang);

    fetch(`${API_BASE}/api/v1/communities?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const data: Community[] = d.data;
          setCommunities(data);
          // Refresh stats only from unfiltered fetch
          if (!activeTag && !activeLang) {
            const cached = loadCachedStats();
            if (!cached) {
              const fresh: PlatformStats = {
                totalCommunities: data.length,
                totalMembers: data.reduce((s, c) => s + c.memberCount, 0),
                updatedAt: new Date().toISOString(),
              };
              saveStatsCache(fresh);
              setStats(fresh);
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeTag, activeLang]);

  const filtered = communities.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-background-primary">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-text-primary">Communities</h1>
          <p className="text-text-secondary text-sm mt-1">
            Telegram communities registered on the MS Platform.
          </p>
        </div>

        {/* Platform stats banner */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-background-secondary border border-border rounded-xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{stats.totalCommunities.toLocaleString()}</p>
                <p className="text-text-secondary text-sm">Communities Registered</p>
              </div>
            </div>
            <div className="bg-background-secondary border border-border rounded-xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">
                  {formatMembers(stats.totalMembers)}
                </p>
                <p className="text-text-secondary text-sm">Total Member Coverage</p>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col gap-4 mb-6">
          {/* Language tabs */}
          <div className="flex flex-wrap gap-2 items-center">
            {LANGUAGE_TABS.map((lang) => (
              <button
                key={lang.value}
                onClick={() => setActiveLang(lang.value)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  activeLang === lang.value
                    ? 'bg-primary text-white border-primary'
                    : 'bg-background-secondary text-text-secondary border-border hover:border-primary/50'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>

          {/* Tag filter + search */}
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => setActiveTag(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeTag === null
                  ? 'bg-primary/20 text-primary border-primary/40'
                  : 'bg-background-secondary text-text-secondary border-border hover:border-primary/50'
              }`}
            >
              All Topics
            </button>
            {TAG_LIBRARY.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  activeTag === tag
                    ? 'bg-primary/20 text-primary border-primary/40'
                    : 'bg-background-secondary text-text-secondary border-border hover:border-primary/50'
                }`}
              >
                {tag}
              </button>
            ))}
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ml-auto sm:w-48 px-3 py-1.5 bg-background-secondary border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary text-xs"
            />
          </div>
        </div>

        {loading ? (
          <div className="bg-background-secondary border border-border rounded-xl overflow-hidden animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 border-b border-border/50 last:border-0" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-background-secondary rounded-xl border border-border">
            <p className="text-text-secondary text-lg mb-2">No communities found</p>
            <p className="text-text-secondary text-sm">
              Telegram group owners can{' '}
              <Link href="/become-ca" className="text-primary underline">Claim a Bot</Link>
              {' '}to register their community.
            </p>
          </div>
        ) : (
          <>
            <p className="text-text-secondary text-sm mb-3">{filtered.length} communities</p>
            <CommunitiesTable communities={filtered} />
          </>
        )}
      </main>
    </div>
  );
}

// ==================== Table ====================

function CommunitiesTable({ communities }: { communities: Community[] }) {
  return (
    <div className="bg-background-secondary border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] gap-4 px-5 py-3 bg-background-tertiary border-b border-border text-xs font-semibold uppercase tracking-wide text-text-secondary">
        <span>Community</span>
        <span>Telegram</span>
        <span>Tags</span>
        <span>Language</span>
        <span className="text-right">Members</span>
      </div>

      {communities.map((c, idx) => (
        <CommunityRow key={c.id} community={c} isLast={idx === communities.length - 1} />
      ))}
    </div>
  );
}

function CommunityRow({ community: c, isLast }: { community: Community; isLast: boolean }) {
  const tags = (c.tags ?? []).slice(0, 3);
  const langs = (c.language ?? []).map((l) => LANGUAGE_LABELS[l] ?? l).join(', ') || '—';

  // Only public groups have a @username → telegramHandle. Numeric caBotId cannot form a valid t.me link.
  const tgLink = c.telegramHandle ? `https://t.me/${c.telegramHandle}` : null;

  return (
    <div className={`grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] gap-4 px-5 py-3.5 items-center hover:bg-background-tertiary/40 transition-colors ${!isLast ? 'border-b border-border/50' : ''}`}>
      {/* Name */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{c.name}</p>
      </div>

      {/* Telegram */}
      <div>
        {tgLink ? (
          <a
            href={tgLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-primary hover:text-primary-light text-xs font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z" />
            </svg>
            <span className="truncate">@{c.telegramHandle}</span>
          </a>
        ) : (
          <span className="text-xs text-text-secondary/50">—</span>
        )}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {tags.length > 0
          ? tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 bg-primary/10 border border-primary/30 rounded-full text-xs text-primary font-medium">
                {tag}
              </span>
            ))
          : <span className="text-xs text-text-secondary/50">—</span>
        }
      </div>

      {/* Language */}
      <div>
        <span className="text-sm text-text-secondary truncate">{langs}</span>
      </div>

      {/* Members */}
      <div className="text-right">
        <span className="text-sm font-semibold text-text-primary">{formatMembers(c.memberCount)}</span>
      </div>
    </div>
  );
}
