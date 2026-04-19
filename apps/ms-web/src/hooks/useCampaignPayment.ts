'use client';

import { useAccount, useChainId, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { MSCampaignVaultABI, ERC20ABI } from '@/lib/contracts/abi';
import { getContractAddress } from '@/lib/contracts/config';
import { parseUnits } from 'viem';
import { campaignsAPI } from '@/lib/api';
import { useEffect, useState } from 'react';

export function useCampaignPayment(campaignId?: string) {
  const { address } = useAccount();
  const chainId = useChainId();
  const [confirmError, setConfirmError] = useState<Error | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  
  const vaultAddress = chainId ? getContractAddress(chainId, 'MSCampaignVault') : undefined;
  const usdtAddress = chainId ? getContractAddress(chainId, 'USDT') : undefined;

  // Write contract hooks
  const { 
    writeContract: approveUSDT,
    data: approveHash,
    isPending: isApproving,
    error: approveError 
  } = useWriteContract();

  const { 
    writeContract: payCampaign,
    data: payHash,
    isPending: isPaying,
    error: payError 
  } = useWriteContract();

  // Transaction receipts
  const { isLoading: isConfirmingApproval, isSuccess: isApproved } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { isLoading: isConfirmingPayment, isSuccess: isPaid } = useWaitForTransactionReceipt({
    hash: payHash,
  });

  // Call backend API when on-chain payment is confirmed
  useEffect(() => {
    if (isPaid && payHash && campaignId) {
      setIsConfirming(true);
      campaignsAPI.confirmPayment(campaignId, payHash)
        .then(() => {
          setIsConfirming(false);
        })
        .catch((err) => {
          setConfirmError(err as Error);
          setIsConfirming(false);
        });
    }
  }, [isPaid, payHash, campaignId]);

  // Read allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdtAddress as `0x${string}`,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: address && vaultAddress 
    ? [address as `0x${string}`, vaultAddress as `0x${string}`] 
    : undefined,
  });

  const approve = async (amount: string) => {
    if (!usdtAddress || !vaultAddress) throw new Error('Contract addresses not configured');
    
    const parsedAmount = parseUnits(amount, 6); // USDT has 6 decimals
    
    approveUSDT({
      address: usdtAddress as `0x${string}`,
      abi: ERC20ABI,
      functionName: 'approve',
      args: [vaultAddress as `0x${string}`, parsedAmount],
    });
  };

  const pay = async (campaignId: string) => {
    if (!vaultAddress) throw new Error('Vault address not configured');
    
    payCampaign({
      address: vaultAddress as `0x${string}`,
      abi: MSCampaignVaultABI,
      functionName: 'payCampaign',
      args: [campaignId],
      gas: BigInt(500000), // Explicit gas limit to avoid estimation issues
    });
  };

  const checkAllowance = async (amount: string): Promise<boolean> => {
    const { data } = await refetchAllowance();
    if (!data) return false;
    
    const parsedAmount = parseUnits(amount, 6);
    return (data as bigint) >= parsedAmount;
  };

  return {
    // Actions
    approve,
    pay,
    checkAllowance,
    
    // States
    isApproving: isApproving || isConfirmingApproval,
    isPaying: isPaying || isConfirmingPayment || isConfirming,
    isApproved,
    isPaid,
    
    // Errors
    approveError,
    payError,
    confirmError,
    
    // Data
    allowance,
    approveHash,
    payHash,
  };
}
