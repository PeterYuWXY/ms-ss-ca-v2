const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);

  // Deploy MockUSDT for testing
  const MockUSDT = await hre.ethers.getContractFactory('MockUSDT');
  const mockUSDT = await MockUSDT.deploy(
    'Mock USDT',
    'mUSDT',
    6, // decimals like real USDT
    1000000 // 1M initial supply
  );
  await mockUSDT.waitForDeployment();
  console.log('MockUSDT deployed to:', await mockUSDT.getAddress());

  // Deploy MSCampaignVault
  const MSCampaignVault = await hre.ethers.getContractFactory('MSCampaignVault');
  const platformWallet = deployer.address; // Use deployer as platform wallet for testing
  const vault = await MSCampaignVault.deploy(
    await mockUSDT.getAddress(),
    platformWallet
  );
  await vault.waitForDeployment();
  console.log('MSCampaignVault deployed to:', await vault.getAddress());

  console.log('\nDeployment Summary:');
  console.log('===================');
  console.log('MockUSDT:', await mockUSDT.getAddress());
  console.log('MSCampaignVault:', await vault.getAddress());
  console.log('Platform Wallet:', platformWallet);
  console.log('Deployer:', deployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
