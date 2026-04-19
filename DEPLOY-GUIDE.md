# Contract Deployment Guide - BSC Testnet

## 你的信息
- **钱包地址**: `0x53423D09eA9F45712720B5654dB58722484fA32f`
- **网络**: BSC Testnet (Chain ID: 97)
- **已领取测试币**: 0.3 BNB ✅

---

## 第一步：配置环境变量

在 `packages/contracts/.env` 创建文件：

```bash
# 你的私钥（带0x前缀）⚠️ 绝对不要提交到git！
PRIVATE_KEY=0x你的私钥

# 你的钱包地址作为treasury（已设置）
TREASURY_ADDRESS=0x53423D09eA9F45712720B5654dB58722484fA32f

# BSC Testnet RPC
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545

# BscScan API Key（用于验证合约，可选）
BSCSCAN_API_KEY=your_bscscan_api_key
```

---

## 第二步：部署合约

```bash
cd ~/projects/MS-SS-CA-v2/packages/contracts

# 安装依赖
npm install

# 编译合约
npx hardhat compile

# 部署到BSC Testnet
npx hardhat run scripts/deploy.ts --network bscTestnet
```

**预期输出**:
```
🚀 Deploying MSCampaignVault to bscTestnet...
📡 Network: bscTestnet
🔑 Deployer: 0x53423D09eA9F45712720B5654dB58722484fA32f
💰 Balance: 0.3 BNB
🏦 Treasury: 0x53423D09eA9F45712720B5654dB58722484fA32f
📄 Deploying MSCampaignVault...
✅ MSCampaignVault deployed to: 0x...（复制这个地址）
🔧 Configuring supported tokens...
  - USDT: 0x337610d27c682E347C9cD60BD4b3b107C9d34dDd
  - USDC: 0x64544969ed7EBf5f083679233325356EbE738930
  - WBNB: 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd
✅ Tokens configured
📝 Deployment info saved to: deployments/bscTestnet.json
```

---

## 第三步：更新合约地址配置

### 3.1 更新前端环境变量

编辑 `apps/ms-web/.env.local`：

```bash
# 将部署的合约地址填入（从上面的输出复制）
NEXT_PUBLIC_CAMPAIGN_VAULT_BSC_TESTNET=0x你的合约地址
```

### 3.2 更新SS Platform配置

编辑 `apps/ss-platform/.env`：

```bash
# BSC Testnet
BSC_TESTNET_VAULT_ADDRESS=0x你的合约地址
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545
```

### 3.3 更新链配置

如果存在 `apps/ss-platform/src/services/chain.ts`，更新：

```typescript
const chainConfig: Record<string, ChainConfig> = {
  bscTestnet: {
    name: 'BSC Testnet',
    chainId: 97,
    rpcUrl: process.env.BSC_TESTNET_RPC || 'https://data-seed-prebsc-1-s1.binance.org:8545',
    vaultAddress: process.env.BSC_TESTNET_VAULT_ADDRESS || '0x你的合约地址',
    usdtAddress: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
    explorerUrl: 'https://testnet.bscscan.com',
  },
  // ...
};
```

---

## 第四步：验证合约（可选但推荐）

```bash
npx hardhat verify --network bscTestnet 0x你的合约地址 0x53423D09eA9F45712720B5654dB58722484fA32f
```

---

## 第五步：完整支付流程测试步骤

### 5.1 准备工作

1. **获取测试USDT**: 访问 https://testnet.bnbchain.org/faucet-smart
   - 选择 "USDT"
   - 输入你的地址 `0x53423D09eA9F45712720B5654dB58722484fA32f`
   - 领取测试USDT

2. **确认余额**: 
   - BNB: > 0.01（用于gas）
   - USDT: > 100（用于测试支付）

### 5.2 测试完整流程

#### Step 1: 创建Campaign
```bash
# 调用合约的createCampaign函数
# 参数: CampaignInput { id, totalBudget, paymentToken }
```

**通过前端测试**:
1. 访问前端页面（http://localhost:3000/create-campaign）
2. 连接钱包（BSC Testnet）
3. 填写Campaign信息
4. 点击创建
5. **链上操作**: 调用 `createCampaign()`

#### Step 2: 支付Campaign
```bash
# 先授权USDT
# 调用 USDT.approve(vaultAddress, amount)

# 再支付
# 调用 vault.payCampaign(campaignId)
```

**通过前端测试**:
1. Campaign创建后点击"Pay"
2. **第一次签名**: Approve USDT（授权合约使用你的USDT）
3. **第二次签名**: Pay Campaign（实际转账到合约）
4. 确认交易成功后，Campaign状态变为 "Active"

#### Step 3: CA执行任务
1. CA Bot接收到任务
2. 在TG频道执行pin/ad/discuss
3. 上传截图证明
4. SS Platform验证并记录执行

#### Step 4: 完成任务并分发奖励
```bash
# 调用 vault.completeCampaign(campaignId, caAddresses, rewards)
# 只有合约owner可以调用
```

**通过SS Platform管理后台**:
1. Campaign到期或达到目标
2. 管理员点击"Complete Campaign"
3. 系统自动计算CA奖励
4. 链上调用 `completeCampaign()`
5. CA直接收到USDT奖励

### 5.3 验证每个步骤

| 步骤 | 验证方法 | 预期结果 |
|------|----------|----------|
| Create | BSCScan查看交易 | Campaign状态为Draft |
| Approve | 查看USDT授权额度 | 授权金额正确 |
| Pay | 查看vault合约余额 | 余额增加，状态变Active |
| Complete | 查看CA钱包余额 | CA收到奖励 |

---

## 常见问题

### Q: 交易失败 "insufficient funds"
- **原因**: BNB余额不足支付gas
- **解决**: 从faucet领取更多BNB

### Q: "Campaign must be in draft status"
- **原因**: Campaign已经被支付过
- **解决**: 创建新的Campaign ID

### Q: "Token not supported"
- **原因**: 支付token未被合约支持
- **解决**: 确保使用BSC Testnet的USDT: `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd`

---

## 部署后检查清单

- [ ] 合约部署成功，地址已保存
- [ ] 合约已验证（可选）
- [ ] 前端.env已更新地址
- [ ] SS Platform.env已更新地址
- [ ] 已领取测试USDT
- [ ] 完整流程测试通过

---

**部署完成后告诉我合约地址，我帮你更新所有配置文件！**