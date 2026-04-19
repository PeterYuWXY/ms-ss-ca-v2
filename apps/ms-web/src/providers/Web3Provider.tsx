'use client';

import { ReactNode, useState, useEffect } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mainnet, bsc, bscTestnet } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let walletConnectModule: any = null;

function createWagmiConfig() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connectors: any[] = [
    injected({ target: 'metaMask' }),
  ];
  
  // Only add walletConnect on client side
  if (typeof window !== 'undefined' && walletConnectModule) {
    connectors.push(
      walletConnectModule.walletConnect({
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project',
        metadata: {
          name: 'MS Marketing Platform',
          description: 'Decentralized Crypto Marketing Crowdsourcing Platform',
          url: 'https://ms.platform.com',
          icons: ['https://ms.platform.com/logo.png'],
        },
      })
    );
  }

  return createConfig({
    chains: [mainnet, bsc, bscTestnet],
    connectors,
    transports: {
      [mainnet.id]: http(process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://eth.llamarpc.com'),
      [bsc.id]: http(process.env.NEXT_PUBLIC_BSC_RPC_URL || 'https://binance.llamarpc.com'),
      [bscTestnet.id]: http(process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545'),
    },
  });
}

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  const [config, setConfig] = useState<ReturnType<typeof createWagmiConfig> | null>(null);
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    // Dynamically import walletConnect to avoid SSR issues
    import('wagmi/connectors').then((mod) => {
      walletConnectModule = mod;
      // Only create config on client side to avoid SSR issues with indexedDB
      setConfig(createWagmiConfig());
    });
  }, []);

  // Return loading state during SSR and initial client load
  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Web3 Provider...</p>
        </div>
      </div>
    );
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
