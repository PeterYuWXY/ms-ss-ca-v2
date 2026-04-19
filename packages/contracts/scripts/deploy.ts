import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

// Token addresses for different networks
const TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
  // Ethereum Mainnet
  ethereum: {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  // Ethereum Sepolia
  sepolia: {
    USDT: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    WETH: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
  },
  // BSC Mainnet
  bsc: {
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  },
  // BSC Testnet
  bscTestnet: {
    USDT: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
    USDC: '0x64544969ed7EBf5f083679233325356EbE738930',
    WBNB: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
  },
  // Base Mainnet
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    WETH: '0x4200000000000000000000000000000000000006',
  },
  // Base Sepolia
  baseSepolia: {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    WETH: '0x4200000000000000000000000000000000000006',
  },
};

async function main() {
  const hre: HardhatRuntimeEnvironment = require('hardhat');
  const network = hre.network.name;
  
  console.log(`🚀 Deploying MSCampaignVault to ${network}...`);
  console.log(`📡 Network: ${network}`);
  
  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log(`🔑 Deployer: ${deployer.address}`);
  
  // Get balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH/BNB`);
  
  // Check if we have enough balance
  if (balance === 0n) {
    throw new Error('Deployer has no balance!');
  }
  
  // Treasury address - use deployer if not set
  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  console.log(`🏦 Treasury: ${treasuryAddress}`);
  
  // Deploy contract
  console.log('📄 Deploying MSCampaignVault...');
  // Get USDT address for the current network
  const usdtAddress = (TOKEN_ADDRESSES[network]?.USDT) || process.env.USDT_ADDRESS;
  if (!usdtAddress) {
    throw new Error(`No USDT address configured for network: ${network}`);
  }
  console.log(`💵 USDT: ${usdtAddress}`);

  const MSCampaignVault = await ethers.getContractFactory('MSCampaignVault');
  const vault = await MSCampaignVault.deploy(usdtAddress, treasuryAddress);
  
  await vault.waitForDeployment();
  
  const vaultAddress = await vault.getAddress();
  console.log(`✅ MSCampaignVault deployed to: ${vaultAddress}`);
  
  // Token support is configured via constructor, no additional setup needed
  const tokens = TOKEN_ADDRESSES[network] || {};
  
  // Save deployment info
  const deploymentInfo = {
    network,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    vaultAddress,
    treasuryAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    tokens: tokens || {},
  };
  
  // Ensure deployments directory exists
  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  // Save deployment file
  const deploymentFile = path.join(deploymentsDir, `${network}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`📝 Deployment info saved to: ${deploymentFile}`);
  
  // Update .env file with new address
  const envFile = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envFile)) {
    let envContent = fs.readFileSync(envFile, 'utf8');
    
    // Update or add VAULT_ADDRESS
    const envVarName = `${network.toUpperCase()}_VAULT_ADDRESS`;
    const envLine = `${envVarName}=${vaultAddress}`;
    
    if (envContent.includes(`${envVarName}=`)) {
      envContent = envContent.replace(
        new RegExp(`${envVarName}=.+`, 'g'),
        envLine
      );
    } else {
      envContent += `\n${envLine}`;
    }
    
    fs.writeFileSync(envFile, envContent);
    console.log(`📝 Updated .env with ${envVarName}`);
  }
  
  console.log('\n🎉 Deployment complete!');
  console.log('\nNext steps:');
  console.log(`1. Verify contract: npx hardhat verify --network ${network} ${vaultAddress} ${treasuryAddress}`);
  console.log(`2. Fund the contract with tokens for testing`);
  console.log(`3. Update frontend .env with VAULT_ADDRESS=${vaultAddress}`);
  
  return deploymentInfo;
}

// Execute deployment
main()
  .then((info) => {
    console.log('\n📊 Deployment Summary:');
    console.log(JSON.stringify(info, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
