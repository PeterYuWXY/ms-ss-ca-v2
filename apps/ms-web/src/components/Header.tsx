'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', audience: 'for Projects' },
  { href: '/campaigns', label: 'Campaigns', audience: 'for All' },
  { href: '/communities', label: 'Communities', audience: 'for All' },
  { href: '/become-ca', label: 'Claim a Bot', audience: 'for Group Managers' },
];

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-background-secondary border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="text-xl font-bold text-primary leading-tight shrink-0">
            Marketing Skill
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex space-x-1">
            {NAV_LINKS.map(({ href, label, audience }) => (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center px-4 py-2 rounded-md transition-colors ${
                  pathname === href
                    ? 'text-primary'
                    : 'text-text-secondary hover:text-primary'
                }`}
              >
                <span className="text-base font-semibold leading-tight">{label}</span>
                <span className="text-[10px] font-normal mt-0.5 opacity-60 leading-tight">{audience}</span>
              </Link>
            ))}
          </nav>

          <div className="hidden md:block">
            <ConnectWalletButton />
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-md text-text-secondary hover:text-primary"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-border pb-4 pt-2">
            <nav className="flex flex-col space-y-1">
              {NAV_LINKS.map(({ href, label, audience }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center justify-between px-4 py-3 rounded-md transition-colors ${
                    pathname === href
                      ? 'text-primary bg-background-tertiary'
                      : 'text-text-secondary hover:text-primary hover:bg-background-tertiary'
                  }`}
                >
                  <span className="text-base font-semibold">{label}</span>
                  <span className="text-xs opacity-60">{audience}</span>
                </Link>
              ))}
            </nav>
            <div className="mt-4 px-4">
              <ConnectWalletButton />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
