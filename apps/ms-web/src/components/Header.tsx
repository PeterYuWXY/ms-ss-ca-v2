'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', audience: 'for Projects' },
  { href: '/campaigns', label: 'Campaigns', audience: 'for All' },
  { href: '/communities', label: 'Communities', audience: 'for All' },
  { href: '/become-ca', label: 'Claim a Bot', audience: 'for Group Managers' },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="bg-background-secondary border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-18 py-3">
          <Link href="/" className="text-2xl font-bold text-primary leading-tight">
            Marketing Skill Platform
          </Link>

          <nav className="flex space-x-1">
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

          <ConnectWalletButton />
        </div>
      </div>
    </header>
  );
}
