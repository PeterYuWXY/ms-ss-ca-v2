'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useEffect, useState } from 'react';

function ConnectWalletButtonCore() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const handleConnect = async () => {
    try {
      // 直接尝试连接 injected (MetaMask)
      connect({ connector: injected() });
    } catch (error) {
      console.error('Connect error:', error);
      // 如果 MetaMask 未安装，提示用户
      if (typeof window !== 'undefined' && !(window as unknown as { ethereum?: unknown }).ethereum) {
        alert('Please install MetaMask!');
      }
    }
  };

  if (isConnected) {
    return (
      <button
        onClick={() => disconnect()}
        className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
      >
        <span className="w-2 h-2 bg-green-400 rounded-full"></span>
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isPending}
      className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
    >
      {isPending ? 'Connecting...' : 'Connect Wallet'}
    </button>
  );
}

export function ConnectWalletButton() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium opacity-50">
        Connect Wallet
      </button>
    );
  }

  return <ConnectWalletButtonCore />;
}
