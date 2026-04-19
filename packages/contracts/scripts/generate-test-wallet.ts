import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * BSC Testnet 测试钱包生成器
 * 生成专门用于测试的钱包，无需暴露生产私钥
 */

function generateTestWallet() {
  // 生成随机钱包
  const wallet = ethers.Wallet.createRandom();
  
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase,
  };
}

function saveTestWallet(wallet: any) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `test-wallet-${timestamp}.json`;
  const filepath = path.join(__dirname, '..', 'test-wallets', filename);
  
  // 确保目录存在
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // 保存钱包信息（包含警告）
  const data = {
    warning: "⚠️ 这是测试专用钱包，仅用于 BSC Testnet 测试！",
    createdAt: new Date().toISOString(),
    network: "BSC Testnet (chainId: 97)",
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic,
    fundRequest: {
      bnbFaucet: "https://testnet.bnbchain.org/faucet-smart",
      usdtNote: "联系合约 owner 在 MSCampaignVault 支持的 USDT 合约中 mint 测试币",
    },
  };
  
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  
  return filepath;
}

function main() {
  console.log('🚀 生成 BSC Testnet 测试钱包...\n');
  
  const wallet = generateTestWallet();
  
  console.log('📍 钱包地址:', wallet.address);
  console.log('🔑 私钥:', wallet.privateKey);
  console.log('📝 助记词:', wallet.mnemonic);
  
  const savedPath = saveTestWallet(wallet);
  console.log('\n💾 钱包信息已保存到:', savedPath);
  
  console.log('\n--- 下一步 ---');
  console.log('1. 访问 https://testnet.bnbchain.org/faucet-smart 获取测试 BNB');
  console.log('2. 将此地址发送给合约 owner 获取测试 USDT');
  console.log('3. 在 MetaMask 中导入此私钥进行测试');
  
  return wallet;
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

export { generateTestWallet, saveTestWallet };