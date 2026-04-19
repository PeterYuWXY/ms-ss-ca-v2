import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import type { MSCampaignVault, MockUSDT } from '../typechain-types';

// Helper: format USDT amounts (6 decimals)
const USDT = (amount: number) => ethers.parseUnits(amount.toString(), 6);

// Contract uses BPS: platformFee = total * 3000 / 10000 = 30%
// caReward = total - platformFee
// For 10 USDT: platformFee = 3 USDT, caReward = 7 USDT
// CA amounts must SUM EXACTLY to caReward
// [4, 3] sums to 7 exactly ✓
function makeCaData(ca1: string, ca2: string) {
  return {
    wallets: [ca1, ca2],
    amounts: [USDT(4), USDT(3)],
  };
}

// Status enum: Draft=0, Pending=1, Active=2, Completed=3, Cancelled=4
const STATUS = { Draft: 0, Pending: 1, Active: 2, Completed: 3, Cancelled: 4 };

async function deployFixture() {
  const [owner, advertiser, ca1, ca2, platformWallet, other] =
    await ethers.getSigners();

  const MockUSDT = await ethers.getContractFactory('MockUSDT');
  const usdt = (await MockUSDT.deploy('Mock USDT', 'USDT', 6, 1_000_000)) as MockUSDT;

  const Vault = await ethers.getContractFactory('MSCampaignVault');
  const vault = (await Vault.deploy(
    await usdt.getAddress(),
    platformWallet.address,
  )) as MSCampaignVault;

  // Fund advertiser and approve vault
  await usdt.mint(advertiser.address, USDT(1000));
  await usdt.connect(advertiser).approve(await vault.getAddress(), USDT(1000));

  return { vault, usdt, owner, advertiser, ca1, ca2, platformWallet, other };
}

// ==================== createCampaign ====================

describe('createCampaign', () => {
  it('allows owner to create campaign', async () => {
    const { vault, owner, advertiser, ca1, ca2 } = await loadFixture(deployFixture);
    const { wallets, amounts } = makeCaData(ca1.address, ca2.address);

    await expect(
      vault.connect(owner).createCampaign(
        'camp-1', advertiser.address, USDT(10), wallets, amounts
      )
    ).to.emit(vault, 'CampaignCreated').withArgs(
      'camp-1', advertiser.address, USDT(10), USDT(3), USDT(7), wallets, amounts
    );
  });

  it('reverts when non-owner tries to create campaign', async () => {
    const { vault, advertiser, ca1, ca2 } = await loadFixture(deployFixture);
    const { wallets, amounts } = makeCaData(ca1.address, ca2.address);

    await expect(
      vault.connect(advertiser).createCampaign(
        'camp-x', advertiser.address, USDT(10), wallets, amounts
      )
    ).to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
  });

  it('reverts on duplicate campaign id', async () => {
    const { vault, owner, advertiser, ca1, ca2 } = await loadFixture(deployFixture);
    const { wallets, amounts } = makeCaData(ca1.address, ca2.address);

    await vault.connect(owner).createCampaign('dup', advertiser.address, USDT(10), wallets, amounts);
    await expect(
      vault.connect(owner).createCampaign('dup', advertiser.address, USDT(10), wallets, amounts)
    ).to.be.revertedWith('Campaign exists');
  });

  it('reverts when totalAmount is 0', async () => {
    const { vault, owner, advertiser, ca1, ca2 } = await loadFixture(deployFixture);
    const { wallets, amounts } = makeCaData(ca1.address, ca2.address);

    await expect(
      vault.connect(owner).createCampaign('zero', advertiser.address, 0, wallets, amounts)
    ).to.be.revertedWith('Invalid amount');
  });

  it('reverts when caWallets and caAmounts lengths differ', async () => {
    const { vault, owner, advertiser, ca1 } = await loadFixture(deployFixture);

    await expect(
      vault.connect(owner).createCampaign(
        'mismatch', advertiser.address, USDT(10),
        [ca1.address],
        [USDT(4), USDT(3)]
      )
    ).to.be.revertedWith('Array length mismatch');
  });

  it('reverts when CA amounts do not exactly equal caReward', async () => {
    const { vault, owner, advertiser, ca1, ca2 } = await loadFixture(deployFixture);

    await expect(
      vault.connect(owner).createCampaign(
        'wrong-amounts', advertiser.address, USDT(10),
        [ca1.address, ca2.address],
        [USDT(4), USDT(2)] // sums to 6, but caReward = 7
      )
    ).to.be.revertedWith("CA amounts don't match reward");
  });

  it('stores campaign with correct 70/30 fee split', async () => {
    const { vault, owner, advertiser, ca1, ca2 } = await loadFixture(deployFixture);
    const { wallets, amounts } = makeCaData(ca1.address, ca2.address);

    await vault.connect(owner).createCampaign('split', advertiser.address, USDT(10), wallets, amounts);

    const campaign = await vault.getCampaign('split');
    expect(campaign.totalAmount).to.equal(USDT(10));
    expect(campaign.platformFee).to.equal(USDT(3));
    expect(campaign.caReward).to.equal(USDT(7));
    expect(campaign.status).to.equal(STATUS.Pending);
  });

  it('reverts when no CA wallets provided', async () => {
    const { vault, owner, advertiser } = await loadFixture(deployFixture);
    await expect(
      vault.connect(owner).createCampaign('no-ca', advertiser.address, USDT(10), [], [])
    ).to.be.revertedWith('No CA wallets');
  });
});

// ==================== payCampaign ====================

describe('payCampaign', () => {
  async function createdFixture() {
    const base = await deployFixture();
    const { vault, owner, advertiser, ca1, ca2 } = base;
    const { wallets, amounts } = makeCaData(ca1.address, ca2.address);
    await vault.connect(owner).createCampaign(
      'pay-camp', advertiser.address, USDT(10), wallets, amounts
    );
    return { ...base, campaignId: 'pay-camp' };
  }

  it('transfers USDT from advertiser to vault and sets status Active', async () => {
    const { vault, usdt, advertiser, campaignId } = await loadFixture(createdFixture);
    const vaultAddr = await vault.getAddress();

    await expect(vault.connect(advertiser).payCampaign(campaignId))
      .to.emit(vault, 'CampaignPaid')
      .withArgs(campaignId, USDT(10));

    expect(await usdt.balanceOf(vaultAddr)).to.equal(USDT(10));
    const campaign = await vault.getCampaign(campaignId);
    expect(campaign.status).to.equal(STATUS.Active);
  });

  it('reverts for non-existent campaign', async () => {
    const { vault, advertiser } = await loadFixture(deployFixture);
    await expect(vault.connect(advertiser).payCampaign('ghost'))
      .to.be.revertedWith('Campaign not found');
  });

  it('reverts when called by unauthorized address (not advertiser or owner)', async () => {
    const { vault, other, campaignId } = await loadFixture(createdFixture);
    await expect(vault.connect(other).payCampaign(campaignId))
      .to.be.revertedWith('Not authorized');
  });

  it('reverts when already paid (no double payment)', async () => {
    const { vault, advertiser, campaignId } = await loadFixture(createdFixture);
    await vault.connect(advertiser).payCampaign(campaignId);
    await expect(vault.connect(advertiser).payCampaign(campaignId))
      .to.be.revertedWith('Invalid status');
  });
});

// ==================== completeCampaign ====================

describe('completeCampaign', () => {
  async function paidFixture() {
    const base = await deployFixture();
    const { vault, owner, advertiser, ca1, ca2 } = base;
    const { wallets, amounts } = makeCaData(ca1.address, ca2.address);
    await vault.connect(owner).createCampaign(
      'comp-camp', advertiser.address, USDT(10), wallets, amounts
    );
    await vault.connect(advertiser).payCampaign('comp-camp');
    return { ...base, campaignId: 'comp-camp' };
  }

  it('distributes platformFee to vault and rewards to CAs', async () => {
    const { vault, usdt, owner, ca1, ca2, platformWallet, campaignId } =
      await loadFixture(paidFixture);

    await expect(vault.connect(owner).completeCampaign(campaignId))
      .to.emit(vault, 'CampaignCompleted')
      .withArgs(campaignId, USDT(3), USDT(7));

    expect(await usdt.balanceOf(platformWallet.address)).to.equal(USDT(3));
    expect(await usdt.balanceOf(ca1.address)).to.equal(USDT(4));
    expect(await usdt.balanceOf(ca2.address)).to.equal(USDT(3));
  });

  it('sets status to Completed and records completedAt', async () => {
    const { vault, owner, campaignId } = await loadFixture(paidFixture);
    await vault.connect(owner).completeCampaign(campaignId);
    const campaign = await vault.getCampaign(campaignId);
    expect(campaign.status).to.equal(STATUS.Completed);
    expect(campaign.completedAt).to.be.gt(0);
  });

  it('reverts when called by non-owner', async () => {
    const { vault, other, campaignId } = await loadFixture(paidFixture);
    await expect(vault.connect(other).completeCampaign(campaignId))
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
  });

  it('reverts when campaign is not Active (Pending → not paid)', async () => {
    const { vault, owner, advertiser, ca1, ca2 } = await loadFixture(deployFixture);
    const { wallets, amounts } = makeCaData(ca1.address, ca2.address);
    await vault.connect(owner).createCampaign('notpaid', advertiser.address, USDT(10), wallets, amounts);
    await expect(vault.connect(owner).completeCampaign('notpaid'))
      .to.be.revertedWith('Campaign not active');
  });

  it('reverts if called twice (already Completed)', async () => {
    const { vault, owner, campaignId } = await loadFixture(paidFixture);
    await vault.connect(owner).completeCampaign(campaignId);
    await expect(vault.connect(owner).completeCampaign(campaignId))
      .to.be.revertedWith('Campaign not active');
  });
});

// ==================== cancelCampaign ====================

describe('cancelCampaign', () => {
  it('cancels a Pending campaign (no refund — no funds held)', async () => {
    const { vault, owner, advertiser, ca1, ca2 } = await loadFixture(deployFixture);
    const { wallets, amounts } = makeCaData(ca1.address, ca2.address);
    await vault.connect(owner).createCampaign('cancel-pend', advertiser.address, USDT(10), wallets, amounts);

    await expect(vault.connect(owner).cancelCampaign('cancel-pend'))
      .to.emit(vault, 'CampaignCancelled')
      .withArgs('cancel-pend', 0);

    const campaign = await vault.getCampaign('cancel-pend');
    expect(campaign.status).to.equal(STATUS.Cancelled);
  });

  it('cancels an Active campaign and refunds advertiser', async () => {
    const { vault, usdt, owner, advertiser, ca1, ca2 } = await loadFixture(deployFixture);
    const { wallets, amounts } = makeCaData(ca1.address, ca2.address);
    await vault.connect(owner).createCampaign('cancel-active', advertiser.address, USDT(10), wallets, amounts);
    await vault.connect(advertiser).payCampaign('cancel-active');

    const balBefore = await usdt.balanceOf(advertiser.address);
    await vault.connect(owner).cancelCampaign('cancel-active');
    const balAfter = await usdt.balanceOf(advertiser.address);

    expect(balAfter - balBefore).to.equal(USDT(10));
    const campaign = await vault.getCampaign('cancel-active');
    expect(campaign.status).to.equal(STATUS.Cancelled);
  });

  it('reverts when called by non-owner', async () => {
    const { vault, owner, advertiser, ca1, ca2, other } = await loadFixture(deployFixture);
    const { wallets, amounts } = makeCaData(ca1.address, ca2.address);
    await vault.connect(owner).createCampaign('cancel-unauth', advertiser.address, USDT(10), wallets, amounts);

    await expect(vault.connect(other).cancelCampaign('cancel-unauth'))
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
  });

  it('reverts when campaign is already Completed', async () => {
    const { vault, owner, advertiser, ca1, ca2 } = await loadFixture(deployFixture);
    const { wallets, amounts } = makeCaData(ca1.address, ca2.address);
    await vault.connect(owner).createCampaign('cancel-done', advertiser.address, USDT(10), wallets, amounts);
    await vault.connect(advertiser).payCampaign('cancel-done');
    await vault.connect(owner).completeCampaign('cancel-done');

    await expect(vault.connect(owner).cancelCampaign('cancel-done'))
      .to.be.revertedWith('Cannot cancel');
  });
});

// ==================== Admin functions ====================

describe('admin functions', () => {
  it('owner can update platformWallet', async () => {
    const { vault, owner, other } = await loadFixture(deployFixture);
    await vault.connect(owner).setPlatformWallet(other.address);
    expect(await vault.platformWallet()).to.equal(other.address);
  });

  it('non-owner cannot update platformWallet', async () => {
    const { vault, other } = await loadFixture(deployFixture);
    await expect(vault.connect(other).setPlatformWallet(other.address))
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
  });

  it('setPlatformWallet rejects zero address', async () => {
    const { vault, owner } = await loadFixture(deployFixture);
    await expect(vault.connect(owner).setPlatformWallet(ethers.ZeroAddress))
      .to.be.revertedWith('Invalid address');
  });
});
