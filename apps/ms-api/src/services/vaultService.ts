import { ethers } from 'ethers';
import { prisma } from '@ms/database';
import { computeCommunityScore } from './communityScoring.js';

// Minimal ABI — only the functions we call from the backend
const VAULT_ABI = [
  'function completeCampaign(string calldata campaignId) external',
  'function cancelCampaign(string calldata campaignId) external',
  'function getCampaign(string calldata campaignId) external view returns (tuple(address advertiser, uint256 totalAmount, uint256 platformFee, uint256 caReward, uint8 status, address[] caWallets, uint256[] caAmounts, uint256 createdAt, uint256 completedAt))',
] as const;

// RPC endpoints keyed by chainId
const RPC_URLS: Record<number, string> = {
  1:  process.env.ETH_RPC_URL  || 'https://rpc.ankr.com/eth',
  56: process.env.BSC_RPC_URL  || 'https://bsc-dataseed1.binance.org',
  97: process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545',
};

// Vault contract addresses keyed by chainId (from deployments)
const VAULT_ADDRESSES: Record<number, string> = {
  97: process.env.VAULT_ADDRESS_BSCTEST || '0xD00914d5EE3C426a97CcFBE7a79DAFC5aCB789F4',
  56: process.env.VAULT_ADDRESS_BSC     || '',
  1:  process.env.VAULT_ADDRESS_ETH     || '',
};

function getVaultContract(chainId: number): ethers.Contract {
  const rpcUrl = RPC_URLS[chainId];
  if (!rpcUrl) throw new Error(`No RPC URL for chainId ${chainId}`);

  const vaultAddress = VAULT_ADDRESSES[chainId];
  if (!vaultAddress) throw new Error(`No vault address for chainId ${chainId}`);

  const operatorKey = process.env.OPERATOR_PRIVATE_KEY;
  if (!operatorKey) throw new Error('OPERATOR_PRIVATE_KEY not set');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(operatorKey, provider);
  return new ethers.Contract(vaultAddress, VAULT_ABI, wallet);
}

/**
 * Call completeCampaign() on-chain and update DB payment status to 'released'.
 * Should be called once all executions for a campaign are finalized.
 */
export async function settleCampaignOnChain(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { payment: true },
  });

  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (!campaign.payment) throw new Error(`No payment record for ${campaignId}`);
  if (campaign.payment.status === 'released') {
    console.log(`[Vault] Campaign ${campaignId} already released, skipping`);
    return;
  }

  const chainId = (campaign.config as Record<string, unknown>)?.chainId as number ?? 97;

  try {
    const vault = getVaultContract(chainId);
    console.log(`[Vault] Calling completeCampaign("${campaignId}") on chain ${chainId}…`);
    const tx = await vault.completeCampaign(campaignId);
    const receipt = await tx.wait();
    console.log(`[Vault] completeCampaign tx confirmed: ${receipt.hash}`);

    // Mark payment released and update campaign timeline
    await prisma.$transaction([
      prisma.campaignPayment.update({
        where: { campaignId },
        data: { status: 'released' },
      }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'completed',
          timeline: {
            ...(campaign.timeline as Record<string, unknown>),
            completedAt: new Date().toISOString(),
            settlementTx: receipt.hash,
          },
        },
      }),
    ]);

    // Mark all pending ExecutionPayments as 'paid'
    await prisma.executionPayment.updateMany({
      where: {
        execution: { campaignId },
        status: 'pending',
      },
      data: { status: 'paid' },
    });

    console.log(`[Vault] Campaign ${campaignId} settled. Tx: ${receipt.hash}`);

    // Refresh community scores in background — ratings now count toward next match
    prisma.campaignCommunity
      .findMany({ where: { campaignId }, select: { communityId: true } })
      .then((ccs) =>
        Promise.all(
          ccs.map(async ({ communityId }) => {
            const s = await computeCommunityScore(communityId);
            await prisma.community.update({ where: { id: communityId }, data: { scoreCache: s } });
          })
        )
      )
      .catch((err) => console.error('[Vault] Post-settlement score refresh failed:', err));
  } catch (err) {
    console.error(`[Vault] Failed to settle campaign ${campaignId}:`, err);
    throw err;
  }
}

/**
 * Check whether all offers for a campaign are in a terminal state
 * (completed, failed, rejected) and trigger on-chain settlement if so.
 *
 * Called after every execution status update.
 */
export async function checkAndSettleCampaignIfComplete(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });

  // Only act on active campaigns
  if (!campaign || campaign.status !== 'active') return;

  const offers = await prisma.offer.findMany({
    where: { campaignId },
    select: { status: true },
  });

  if (offers.length === 0) return;

  const TERMINAL = new Set(['completed', 'failed', 'rejected']);
  const allDone = offers.every(o => TERMINAL.has(o.status));
  if (!allDone) return;

  const completedCount = offers.filter(o => o.status === 'completed').length;
  console.log(
    `[Vault] All ${offers.length} offers finalized for campaign ${campaignId} ` +
    `(${completedCount} completed, ${offers.length - completedCount} failed/rejected). ` +
    `Triggering on-chain settlement…`
  );

  try {
    await settleCampaignOnChain(campaignId);
  } catch (err) {
    // Non-fatal: DB is already in a good state; on-chain call can be retried manually
    console.error(`[Vault] On-chain settlement failed for ${campaignId}. Retry manually.`, err);
  }
}
