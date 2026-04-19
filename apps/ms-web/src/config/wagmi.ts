'use client';

import { createConfig, http } from 'wagmi';
import { mainnet, bsc, bscTestnet } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

export const config = createConfig({
  chains: [mainnet, bsc, bscTestnet],
  connectors: [
    injected({ target: 'metaMask' }),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project',
      metadata: {
        name: 'MS Marketing Platform',
        description: 'Decentralized Crypto Marketing Crowdsourcing Platform',
        url: 'https://ms.platform.com',
        icons: ['https://ms.platform.com/logo.png'],
      },
    }),
  ],
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://eth.llamarpc.com'),
    [bsc.id]: http(process.env.NEXT_PUBLIC_BSC_RPC_URL || 'https://binance.llamarpc.com'),
    [bscTestnet.id]: http('https://data-seed-prebsc-1-s1.binance.org:8545'),
  },
});
