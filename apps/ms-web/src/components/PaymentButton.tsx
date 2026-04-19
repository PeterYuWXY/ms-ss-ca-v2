'use client';

import { useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useCampaignPayment } from '@/hooks/useCampaignPayment';

interface PaymentButtonProps {
  campaignId: string;
  amount: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function PaymentButton({ campaignId, amount, onSuccess, onError }: PaymentButtonProps) {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [step, setStep] = useState<'idle' | 'checking' | 'approving' | 'paying' | 'completed'>('idle');
  
  const {
    approve,
    pay,
    checkAllowance,
    isApproving,
    isPaying,
    isApproved,
    isPaid,
    approveError,
    payError,
  } = useCampaignPayment();

  const handlePayment = async () => {
    try {
      setStep('checking');
      const hasAllowance = await checkAllowance(amount);
      
      if (!hasAllowance) {
        setStep('approving');
        await approve(amount);
        return;
      }
      
      setStep('paying');
      await pay(campaignId);
    } catch (error) {
      onError?.(error as Error);
      setStep('idle');
    }
  };

  if (step === 'approving' && isApproved) {
    handlePayment();
  }

  if (step === 'paying' && isPaid) {
    setStep('completed');
    onSuccess?.();
  }

  if (!isConnected) {
    return (
      <button
        onClick={() => connect({ connector: injected() })}
        className="w-full py-4 bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition-colors"
      >
        Connect Wallet
      </button>
    );
  }

  const isLoading = isApproving || isPaying;
  const error = approveError || payError;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg">
        <span className="text-sm text-text-secondary">Connected:</span>
        <span className="text-sm font-medium text-text-primary">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
        <button
          onClick={() => disconnect()}
          className="text-xs text-red-400 hover:text-red-300"
        >
          Disconnect
        </button>
      </div>

      <button
        onClick={handlePayment}
        disabled={isLoading || step === 'completed'}
        className={`w-full py-4 rounded-lg font-medium transition-colors ${
          step === 'completed'
            ? 'bg-green-500 text-white'
            : isLoading
            ? 'bg-gray-400 text-white cursor-not-allowed'
            : 'bg-primary hover:bg-primary-dark text-white'
        }`}
      >
        {step === 'idle' && `Approve & Pay ${amount} USDT`}
        {step === 'checking' && 'Checking allowance...'}
        {step === 'approving' && 'Approving USDT...'}
        {step === 'paying' && 'Processing payment...'}
        {step === 'completed' && '✓ Payment completed'}
      </button>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          <p className="font-medium">Payment failed</p>
          <p>{error.message}</p>
        </div>
      )}

      {step === 'completed' && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm">
          <p className="font-medium">Payment successful!</p>
          <p>Your campaign is now active.</p>
        </div>
      )}
    </div>
  );
}
