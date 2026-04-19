'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <button
        onClick={() => disconnect()}
        className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </button>
    );
  }

  return (
    <div className="relative group">
      <button
        disabled={isPending}
        className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        {isPending ? 'Connecting...' : 'Connect Wallet'}
      </button>
      
      <div className="absolute right-0 mt-2 w-48 bg-background-secondary rounded-lg border border-border shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            className="w-full text-left px-4 py-3 hover:bg-background-tertiary first:rounded-t-lg last:rounded-b-lg transition-colors"
          >
            <span className="text-text-primary">{connector.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
