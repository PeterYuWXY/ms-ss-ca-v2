import { ethers } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

/**
 * BSC Testnet 部署脚本
 * 使用环境变量中的私钥部署合约
 * 
 * 使用方法:
 * 1. 设置环境变量: export PRIVATE_KEY=your_private_key
 * 2. 运行: npx hardhat run scripts/deploy-bsc-testnet.ts --network bscTestnet
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log('🚀 部署到 BSC Testnet...');
  console.log('📍 部署地址:', deployer.address);
  
  // 获取余额
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('💰 余额:', ethers.formatEther(balance), 'BNB');
  
  if (balance === 0n) {
    console.error('❌ 余额不足，请从水龙头获取测试 BNB:');
    console.error('   https://testnet.bnbchain.org/faucet-smart');
    process.exit(1);
  }
  
  // 部署 MockUSDT (如果没有测试 USDT)
  console.log('\n📦 部署 MockUSDT...');
  const MockUSDT = await ethers.getContractFactory('MockUSDT');
  const mockUSDT = await MockUSDT.deploy();
  await mockUSDT.waitForDeployment();
  const usdtAddress = await mockUSDT.getAddress();
  console.log('✅ MockUSDT 部署成功:', usdtAddress);
  
  // 部署 MSCampaignVault
  console.log('\n📦 部署 MSCampaignVault...');
  const MSCampaignVault = await ethers.getContractFactory('MSCampaignVault');
  // treasury 设置为部署者地址（测试环境）
  const vault = await MSCampaignVault.deploy(deployer.address);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log('✅ MSCampaignVault 部署成功:', vaultAddress);
  
  // 配置支持的代币
  console.log('\n⚙️ 配置合约...');
  await vault.setTokenSupport(usdtAddress, true);
  console.log('✅ 已添加 MockUSDT 到支持列表');
  
  // 输出部署信息
  console.log('\n--- 部署完成 ---');
  console.log({
    network: 'BSC Testnet',
    chainId: 97,
    contracts: {
      MockUSDT: usdtAddress,
      MSCampaignVault: vaultAddress,
    },
    treasury: deployer.address,
  });
  
  // 保存部署信息
  const deploymentInfo = {
    network: 'bscTestnet',
    chainId: 97,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      MockUSDT: usdtAddress,
      MSCampaignVault: vaultAddress,
    },
  };
  
  const fs = require('fs');
  const path = require('path');
  const deployDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }
  
  const filename = `bsc-testnet-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deployDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log(`\n💾 部署信息已保存到: deployments/${filename}`);
  
  // 输出环境变量配置
  console.log('\n--- 环境变量配置 ---');
  console.log(`NEXT_PUBLIC_CAMPAIGN_VAULT_BSC_TESTNET=${vaultAddress}`);
  console.log(`NEXT_PUBLIC_USDT_BSC_TESTNET=${usdtAddress}`);
  
  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });