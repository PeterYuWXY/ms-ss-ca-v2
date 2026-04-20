const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

// BSC Mainnet official USDT address
const BSC_MAINNET_USDT = '0x55d398326f99059fF775485246999027B3197955';

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying to BSC Mainnet with account:', deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', hre.ethers.formatEther(balance), 'BNB');

  // Deploy MSCampaignVault with real USDT and deployer as treasury
  const MSCampaignVault = await hre.ethers.getContractFactory('MSCampaignVault');
  const vault = await MSCampaignVault.deploy(
    BSC_MAINNET_USDT,
    deployer.address // treasury wallet (platform fee recipient)
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log('MSCampaignVault deployed to:', vaultAddress);

  // Save deployment info
  const deployment = {
    network: 'bsc',
    chainId: '56',
    vaultAddress,
    treasuryAddress: deployer.address,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    tokens: {
      USDT: BSC_MAINNET_USDT,
    },
  };

  const outPath = path.join(__dirname, '../deployments/bscMainnet.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log('\nDeployment saved to deployments/bscMainnet.json');

  console.log('\n========== Deployment Summary ==========');
  console.log('MSCampaignVault:', vaultAddress);
  console.log('USDT (real):', BSC_MAINNET_USDT);
  console.log('Treasury:', deployer.address);
  console.log('Deployer:', deployer.address);
  console.log('========================================');
  console.log('\nNext: update VAULT_ADDRESS_BSC in VPS .env and NEXT_PUBLIC_CAMPAIGN_VAULT_BSC in Vercel');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
