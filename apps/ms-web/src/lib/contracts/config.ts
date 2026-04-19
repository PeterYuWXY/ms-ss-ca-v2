// Contract addresses - update after deployment
export const CONTRACT_ADDRESSES = {
  // Ethereum Mainnet (chainId: 1)
  1: {
    MSCampaignVault: process.env.NEXT_PUBLIC_CAMPAIGN_VAULT_ETHEREUM || '0x0000000000000000000000000000000000000000',
    USDT: process.env.NEXT_PUBLIC_USDT_ETHEREUM || '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  // BSC Mainnet (chainId: 56)
  56: {
    MSCampaignVault: process.env.NEXT_PUBLIC_CAMPAIGN_VAULT_BSC || '0x0000000000000000000000000000000000000000',
    USDT: process.env.NEXT_PUBLIC_USDT_BSC || '0x55d398326f99059fF775485246999027B3197955',
  },
  // BSC Testnet (chainId: 97)
  97: {
    MSCampaignVault: process.env.NEXT_PUBLIC_CAMPAIGN_VAULT_BSC_TESTNET || '0x0000000000000000000000000000000000000000',
    USDT: process.env.NEXT_PUBLIC_USDT_BSC_TESTNET || '0x0000000000000000000000000000000000000000',
  },
} as const;

export type SupportedChainId = keyof typeof CONTRACT_ADDRESSES;

export function getContractAddress(chainId: number, contract: 'MSCampaignVault' | 'USDT'): string {
  const addresses = CONTRACT_ADDRESSES[chainId as SupportedChainId];
  if (!addresses) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return addresses[contract];
}
