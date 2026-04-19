'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { Header } from '@/components/Header';

const BOT_USERNAME = 'MSCommunityAgent_bot';

export default function BecomeCaPage() {
  const { address, isConnected } = useAccount();
  const [copied, setCopied] = useState(false);

  const deepLink = isConnected && address
    ? `https://t.me/${BOT_USERNAME}?start=register_${address}`
    : null;

  const handleCopy = () => {
    if (!deepLink) return;
    navigator.clipboard.writeText(deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="min-h-screen bg-background-primary">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Hero — Group Manager focused */}
        <div className="text-center mb-12">
          <div className="inline-block bg-primary/10 border border-primary/30 text-primary text-sm font-medium px-4 py-1.5 rounded-full mb-4">
            For Telegram Group Managers
          </div>
          <h1 className="text-4xl font-bold text-text-primary mb-4">
            Monetise Your Telegram Community
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Install the CA Bot in your group, accept crypto promotion campaigns, and receive
            USDT directly to your wallet — automatically, no chasing advertisers.
          </p>
        </div>

        {/* Earnings model */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          {[
            { value: 'USDT', label: 'on-chain, direct to your wallet after campaign ends' },
            { value: 'Fixed', label: 'transparent pricing — no hidden costs or surprises' },
            { value: 'Auto', label: 'payment released automatically when campaign completes' },
          ].map(({ value, label }) => (
            <div key={value} className="bg-background-secondary border border-border rounded-lg p-5 text-center">
              <div className="text-3xl font-bold text-secondary mb-1">{value}</div>
              <p className="text-text-secondary text-xs">{label}</p>
            </div>
          ))}
        </div>

        {/* Step-by-step setup */}
        <div className="bg-background-secondary border border-border rounded-lg p-8 mb-8">
          <h2 className="text-xl font-bold text-text-primary mb-6">Setup Guide — 5 Steps</h2>

          <div className="space-y-5">
            {[
              {
                step: '1',
                title: 'Connect your crypto wallet',
                detail: 'Your wallet address becomes your USDT payout address. All campaign rewards are sent here on-chain.',
                highlight: false,
              },
              {
                step: '2',
                title: 'Open the CA Bot on Telegram',
                detail: `Click "Claim CA Bot on Telegram" below. Telegram opens a DM with @${BOT_USERNAME}. Tap START — the bot receives your wallet address automatically and gives you next-step instructions.`,
                highlight: false,
              },
              {
                step: '3',
                title: 'Add Bot to your group as Admin (Required)',
                detail: null,
                highlight: true,
                admin: true,
              },
              {
                step: '4',
                title: 'Send /register in your group',
                detail: 'Once the bot is an admin, open your group and send /register. The bot registers your community, links your wallet, and you\'re ready to receive campaigns.',
                highlight: false,
              },
              {
                step: '5',
                title: 'Execute campaigns with two commands',
                detail: null,
                highlight: false,
                commands: true,
              },
            ].map(({ step, title, detail, highlight, admin, commands }: any) => (
              <div
                key={step}
                className={`flex gap-4 rounded-lg p-4 ${highlight ? 'bg-accent/10 border border-accent/40' : 'bg-background-tertiary/50'}`}
              >
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${highlight ? 'bg-accent text-white' : 'bg-primary/20 text-primary'}`}>
                  {step}
                </div>
                <div className="flex-1">
                  <p className={`font-semibold ${highlight ? 'text-accent' : 'text-text-primary'}`}>{title}</p>
                  {admin ? (
                    <div className="mt-2 space-y-1.5 text-sm text-text-secondary">
                      <p>In Telegram, open your group → <strong className="text-text-primary">Group Info → Administrators → Add Admin</strong></p>
                      <p>Search for <span className="font-mono text-text-primary">@{BOT_USERNAME}</span> and add it.</p>
                      <p>Grant these two permissions:</p>
                      <ul className="ml-4 space-y-0.5">
                        <li>✅ <strong className="text-text-primary">Pin Messages</strong> — required for pinned campaign posts</li>
                        <li>✅ <strong className="text-text-primary">Send Messages</strong> — required for campaign delivery (usually on by default)</li>
                      </ul>
                      <p className="text-accent font-medium text-xs mt-1">
                        ⚠️ Without admin + pin permission, campaigns cannot be executed and rewards cannot be earned.
                      </p>
                    </div>
                  ) : commands ? (
                    <div className="mt-2 space-y-2 text-sm text-text-secondary">
                      <p>When you accept a campaign offer, the bot will DM you the ad brief. Then go to your group and run:</p>
                      <div className="space-y-1.5">
                        <div className="flex items-start gap-2 bg-background-primary rounded px-3 py-2">
                          <span className="font-mono text-primary font-semibold shrink-0">/pin &lt;ad text&gt;</span>
                          <span className="text-text-secondary">— bot posts and pins the message in the group</span>
                        </div>
                        <div className="flex items-start gap-2 bg-background-primary rounded px-3 py-2">
                          <span className="font-mono text-primary font-semibold shrink-0">/ad &lt;ad text&gt;</span>
                          <span className="text-text-secondary">— bot posts an ad message in the group</span>
                        </div>
                      </div>
                      <p className="text-xs">Each action is recorded automatically. Once all requirements are met, your USDT reward is released.</p>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-text-secondary">{detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA block */}
        <div className="bg-background-secondary border border-border rounded-lg p-8">
          <h2 className="text-xl font-bold text-text-primary mb-2 text-center">Ready to Start?</h2>

          {!isConnected ? (
            <div className="text-center mt-4">
              <p className="text-text-secondary text-sm mb-5">
                Step 1: Connect your wallet — this will be your USDT payout address.
              </p>
              <ConnectWalletButton />
            </div>
          ) : (
            <div>
              <p className="text-text-secondary text-sm text-center mb-6">
                Wallet connected:{' '}
                <span className="font-mono text-text-primary">{address?.slice(0, 10)}…{address?.slice(-6)}</span>
                {' '}— rewards will be paid to this address.
              </p>

              {/* Primary button */}
              <div className="flex justify-center mb-6">
                <a
                  href={deepLink!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-primary hover:bg-primary-dark text-white px-10 py-4 rounded-lg font-bold text-lg transition-colors shadow-lg"
                >
                  Claim CA Bot on Telegram →
                </a>
              </div>

              {/* What happens next */}
              <div className="bg-background-tertiary border border-border rounded-lg p-4 mb-6 text-sm">
                <p className="font-semibold text-text-primary mb-2">What happens when you click the button above:</p>
                <ol className="list-decimal list-inside space-y-1 text-text-secondary">
                  <li>Telegram opens a DM with <span className="font-mono text-primary">@{BOT_USERNAME}</span></li>
                  <li>Tap <strong className="text-text-primary">START</strong> — your wallet address is sent to the bot automatically</li>
                  <li>The bot confirms receipt and tells you to add it to your group</li>
                  <li>Add the bot to your group as Admin (see Step 3 above)</li>
                  <li>Send <span className="font-mono text-text-primary">/register</span> in your group — done!</li>
                </ol>
              </div>

              {/* Manual fallback — improved instructions */}
              <div className="border border-border rounded-lg p-4">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                  Can't click the button? Use this link manually
                </p>
                <p className="text-xs text-text-secondary mb-3">
                  Copy the link below, then open Telegram on any device → tap the search bar → paste the link → press Go / Send.
                  It will open a chat with the bot and automatically link your wallet. <strong className="text-text-primary">Do not share this link</strong> — it contains your wallet address.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-text-primary bg-background-primary rounded px-3 py-2 truncate font-mono border border-border">
                    {deepLink}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 bg-background-tertiary hover:bg-border text-text-primary px-4 py-2 rounded font-medium text-sm transition-colors border border-border"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-[11px] text-text-secondary mt-2">
                  After pasting in Telegram: tap <strong>START</strong> in the bot chat, then follow the same steps (add to group as admin → /register in group).
                </p>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
