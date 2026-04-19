import { ethers } from 'hardhat';

async function main() {
  const CONTRACT_ADDRESS = "0xD00914d5EE3C426a97CcFBE7a79DAFC5aCB789F4";
  const USDT_BSCTEST = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
  
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);
  
  const vault = await ethers.getContractAt("MSCampaignVault", CONTRACT_ADDRESS);
  
  // Add USDT as supported token
  const tx = await vault.setTokenSupport(USDT_BSCTEST, true);
  await tx.wait();
  
  console.log("✅ USDT added as supported token");
  
  // Verify
  const isSupported = await vault.supportedTokens(USDT_BSCTEST);
  console.log("USDT supported:", isSupported);
}

main().catch(console.error);
