# BSC Testnet 支付流程测试 - 无暴露私钥方案

## 方案概述

**目标**: 完整测试支付流程，不暴露任何私钥
**方案**: 提供两种选择

---

## 方案 A: 使用您的现有钱包部署（推荐）

### 步骤 1: 您自行部署（私钥不离开您的电脑）

```bash
# 1. 进入合约目录
cd packages/contracts

# 2. 安装依赖（如未安装）
pnpm install

# 3. 设置环境变量（您的私钥只在您的终端）
export PRIVATE_KEY=您的私钥

# 4. 部署到 BSC Testnet
npx hardhat run scripts/deploy-bsc-testnet.ts --network bscTestnet
```

### 步骤 2: 获取测试 BNB

访问: https://testnet.bnbchain.org/faucet-smart
输入您的部署地址获取测试 BNB

### 步骤 3: 发送部署结果给我

部署成功后，复制输出的合约地址，例如：
```
MockUSDT: 0x...
MSCampaignVault: 0x...
```

我将更新前端配置并执行测试。

---

## 方案 B: 使用生成的测试钱包

### 步骤 1: 生成测试钱包

我已为您生成了专门的测试钱包：

```
📍 地址: 0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B
🔑 私钥: 0x...（保存在本地，不发送给任何人）
```

### 步骤 2: 您给测试钱包充值

1. **BNB**: 访问 https://testnet.bnbchain.org/faucet-smart
   - 输入测试钱包地址: `0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B`
   - 领取测试 BNB

2. **USDT**: 部署后，我作为合约 owner 可以给测试钱包 mint 测试 USDT

### 步骤 3: 导入 MetaMask 测试

将测试钱包私钥导入 MetaMask（作为独立账户），进行前端测试。

---

## 测试流程

部署完成后，完整测试流程：

```
1. 访问 http://localhost:3000/campaigns/create
2. 连接 MetaMask（BSC Testnet）
3. 填写 Campaign 表单
4. 提交 → 触发链上交互：
   - createCampaign()
   - approve(USDT)
   - payCampaign()
5. 确认支付成功
6. 验证数据库状态更新
```

---

## 验证清单

### 链上验证
- [ ] CampaignCreated 事件在 BSC Testnet Explorer 可见
- [ ] USDT 授权交易成功
- [ ] CampaignPaid 事件触发
- [ ] 资金锁定在合约中

### API 验证
- [ ] POST /api/campaigns 返回 201
- [ ] POST /api/campaigns/:id/confirm-payment 返回 200
- [ ] GET /api/campaigns/:id 返回 paid 状态

### 前端验证
- [ ] 支付状态 UI 正确显示
- [ ] 交易链接可点击到 BSC Testnet Explorer
- [ ] 支付成功后跳转到 Dashboard

---

## 故障排查

### 1. 部署失败：insufficient funds
**解决**: 从水龙头获取测试 BNB

### 2. payCampaign 失败：Campaign does not exist
**解决**: 确保先调用 createCampaign

### 3. 前端无法连接合约
**解决**: 检查 .env.local 中的合约地址是否正确

### 4. MetaMask 无法切换网络
**解决**: 手动添加 BSC Testnet:
- RPC: https://data-seed-prebsc-1-s1.binance.org:8545
- Chain ID: 97
- Symbol: tBNB

---

## 时间预估

| 步骤 | 时间 |
|------|------|
| 部署合约 | 5-10 分钟 |
| 获取测试币 | 2-5 分钟 |
| 完整测试流程 | 15-30 分钟 |
| **总计** | **30-45 分钟** |

---

**请选择方案 A 或 B，我立即配合执行。**
