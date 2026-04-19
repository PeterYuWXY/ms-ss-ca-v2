'use client';

import { useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId } from 'wagmi';
import { type Address } from 'viem';
import { mainnet, bsc, bscTestnet } from 'wagmi/chains';

// SPDX-License-Identifier: MIT
// MSCampaignVault Contract ABI - matches deployed contract at 0xD00914d5EE3C426a97CcFBE7a79DAFC5aCB789F4
const CAMPAIGN_VAULT_ABI = [
  {
    inputs: [
      { internalType: 'string', name: 'campaignId', type: 'string' },
      { internalType: 'address', name: 'advertiser', type: 'address' },
      { internalType: 'uint256', name: 'totalAmount', type: 'uint256' },
      { internalType: 'address[]', name: 'caWallets', type: 'address[]' },
      { internalType: 'uint256[]', name: 'caAmounts', type: 'uint256[]' },
    ],
    name: 'createCampaign',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'campaignId', type: 'string' },
    ],
    name: 'payCampaign',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'campaignId', type: 'string' },
    ],
    name: 'completeCampaign',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'campaignId', type: 'string' },
    ],
    name: 'cancelCampaign',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'campaignId', type: 'string' }],
    name: 'getCampaign',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'advertiser', type: 'address' },
          { internalType: 'uint256', name: 'totalAmount', type: 'uint256' },
          { internalType: 'uint256', name: 'platformFee', type: 'uint256' },
          { internalType: 'uint256', name: 'caReward', type: 'uint256' },
          { internalType: 'uint8', name: 'status', type: 'uint8' },
          { internalType: 'address[]', name: 'caWallets', type: 'address[]' },
          { internalType: 'uint256[]', name: 'caAmounts', type: 'uint256[]' },
          { internalType: 'uint256', name: 'createdAt', type: 'uint256' },
          { internalType: 'uint256', name: 'completedAt', type: 'uint256' },
        ],
        internalType: 'struct MSCampaignVault.Campaign',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'string', name: 'campaignId', type: 'string' },
      { indexed: true, internalType: 'address', name: 'advertiser', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'CampaignCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'string', name: 'campaignId', type: 'string' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'CampaignPaid',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'string', name: 'campaignId', type: 'string' },
      { indexed: false, internalType: 'uint256', name: 'platformFee', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'caReward', type: 'uint256' },
    ],
    name: 'CampaignCompleted',
    type: 'event',
  },
] as const;

// USDT ERC20 ABI (minimal)
const ERC20_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Get contract address based on chain ID - Hardcoded for testing
function getContractAddress(chainId: number): Address {
  // Deployed contract: 0xBBA8D86f512025D623B3E981AC95BCf629A55E8C (BSC Testnet)
  const addresses: Record<number, Address> = {
    [mainnet.id]: '0x0000000000000000000000000000000000000000',
    [bsc.id]: '0x0000000000000000000000000000000000000000',
    [bscTestnet.id]: '0xBBA8D86f512025D623B3E981AC95BCf629A55E8C',
  };
  
  return addresses[chainId] || '0x0000000000000000000000000000000000000000';
}

// USDT addresses
function getUSDTAddress(chainId: number): Address {
  const addresses: Record<number, Address> = {
    [mainnet.id]: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    [bsc.id]: '0x55d398326f99059fF775485246999027B3197955',
    [bscTestnet.id]: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', // Test USDT
  };
  
  return addresses[chainId] || '0x0000000000000000000000000000000000000000';
}

interface UseCampaignContractReturn {
  createCampaign: (params: {
    campaignId: string;
    advertiser: Address;
    totalAmount: bigint;
    caWallets: Address[];
    caAmounts: bigint[];
  }) => Promise<`0x${string}`>;
  payCampaign: (campaignId: string) => Promise<`0x${string}`>;
  completeCampaign: (campaignId: string) => Promise<`0x${string}`>;
  cancelCampaign: (campaignId: string) => Promise<`0x${string}`>;
  approveUSDT: (amount: bigint) => Promise<`0x${string}`>;
  isPending: boolean;
  isSuccess: boolean;
  error: Error | null;
  hash: `0x${string}` | undefined;
}

export function useCampaignContract(): UseCampaignContractReturn {
  const { address } = useAccount();
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId);
  const usdtAddress = getUSDTAddress(chainId);
  
  const { 
    writeContractAsync, 
    data: hash,
    error,
    isPending,
  } = useWriteContract();

  const { isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const createCampaign = async ({
    campaignId,
    advertiser,
    totalAmount,
    caWallets,
    caAmounts,
  }: {
    campaignId: string;
    advertiser: Address;
    totalAmount: bigint;
    caWallets: Address[];
    caAmounts: bigint[];
  }): Promise<`0x${string}`> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    if (contractAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Contract not deployed on this network');
    }

    const txHash = await writeContractAsync({
      address: contractAddress,
      abi: CAMPAIGN_VAULT_ABI,
      functionName: 'createCampaign',
      args: [campaignId, advertiser, totalAmount, caWallets, caAmounts],
      gas: BigInt(500000), // 创建campaign需要更多gas
    });
    
    return txHash;
  };

  const payCampaign = async (campaignId: string): Promise<`0x${string}`> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    if (contractAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Contract not deployed on this network');
    }

    const txHash = await writeContractAsync({
      address: contractAddress,
      abi: CAMPAIGN_VAULT_ABI,
      functionName: 'payCampaign',
      args: [campaignId],
      gas: BigInt(300000),
    });
    
    return txHash;
  };

  const completeCampaign = async (campaignId: string): Promise<`0x${string}`> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    if (contractAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Contract not deployed on this network');
    }

    const txHash = await writeContractAsync({
      address: contractAddress,
      abi: CAMPAIGN_VAULT_ABI,
      functionName: 'completeCampaign',
      args: [campaignId],
    });
    
    return txHash;
  };

  const cancelCampaign = async (campaignId: string): Promise<`0x${string}`> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    if (contractAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Contract not deployed on this network');
    }

    const txHash = await writeContractAsync({
      address: contractAddress,
      abi: CAMPAIGN_VAULT_ABI,
      functionName: 'cancelCampaign',
      args: [campaignId],
    });
    
    return txHash;
  };

  const approveUSDT = async (amount: bigint): Promise<`0x${string}`> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    const txHash = await writeContractAsync({
      address: usdtAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contractAddress, amount],
      gas: BigInt(100000),
    });
    
    return txHash;
  };

  return {
    createCampaign,
    payCampaign,
    completeCampaign,
    cancelCampaign,
    approveUSDT,
    isPending,
    isSuccess,
    error: error || null,
    hash,
  };
}

// Helper function to convert string to bytes32
function stringToBytes32(str: string): `0x${string}` {
  // Ensure the string is not longer than 32 bytes
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  if (bytes.length > 32) {
    throw new Error('String too long for bytes32');
  }
  
  // Pad with zeros to 32 bytes
  const padded = new Uint8Array(32);
  padded.set(bytes);
  
  return `0x${Array.from(padded).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
}
