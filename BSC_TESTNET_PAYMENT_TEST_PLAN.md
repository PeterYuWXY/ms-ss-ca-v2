# BSC Testnet 支付流程测试计划

## 测试目标
验证 MSCampaignVault 合约在 BSC Testnet 的完整支付流程：
1. Campaign 创建 (createCampaign)
2. USDT 授权 (approve)
3. Campaign 支付 (payCampaign)
4. 支付确认 (confirm-payment API)

---

## 前置条件

### 1. 合约部署
- [ ] MSCampaignVault 合约部署到 BSC Testnet
- [ ] 获取合约地址
- [ ] 更新 .env.local 配置

### 2. 测试资金
- [ ] 获取 BSC Testnet BNB (gas)
- [ ] 获取 Testnet USDT (可从合约 owner mint)

### 3. 测试钱包
- [ ] MetaMask 配置 BSC Testnet
- [ ] 钱包有足够测试资金

---

## BSC Testnet 配置

```
Network Name: BSC Testnet
RPC URL: https://data-seed-prebsc-1-s1.binance.org:8545/
Chain ID: 97
Currency Symbol: tBNB
Block Explorer: https://testnet.bscscan.com
```

---

## 测试步骤

### Step 1: 合约部署

需要部署的合约：
1. **MockUSDT** (测试 USDT) - 可选，可用已有测试代币
2. **MSCampaignVault** (Campaign 资金托管合约)

### Step 2: 环境配置

更新 `apps/ms-web/.env.local`:
```
NEXT_PUBLIC_CAMPAIGN_VAULT_BSC_TESTNET=0x...
NEXT_PUBLIC_USDT_BSC_TESTNET=0x...
```

### Step 3: 启动服务

```bash
# Terminal 1: API Server
cd apps/ms-api
npm run dev

# Terminal 2: Web App
cd apps/ms-web
npm run dev
```

### Step 4: 执行测试流程

1. 访问 http://localhost:3000/campaigns/create
2. 连接 MetaMask (切换到 BSC Testnet)
3. 填写表单并提交
4. 确认链上交易
5. 验证数据库状态

---

## 验证清单

### 链上验证
- [ ] CampaignCreated 事件触发
- [ ] USDT 授权成功
- [ ] CampaignPaid 事件触发
- [ ] 资金锁定在合约中

### API 验证
- [ ] POST /api/campaigns 返回 201
- [ ] POST /api/campaigns/:id/confirm-payment 返回 200
- [ ] GET /api/campaigns/:id 返回 paid 状态

### 数据库验证
- [ ] campaign 记录创建
- [ ] status 从 pending → paid
- [ ] txHash 记录正确

---

## 测试数据

```typescript
// 测试 Campaign 数据
{
  campaignId: "camp_test_001",
  advertiser: "0x...", // 测试钱包地址
  objective: "awareness",
  skillId: "tweet-shill",
  communities: ["1", "2", "3"],
  duration: 7,
  budget: 100, // USDT
  totalAmount: 100000000, // 6 decimals (100 USDT)
  chainId: 97, // BSC Testnet
}
```

---

## 故障排查

### 问题 1: 合约地址未配置
**现象**: "Contract not deployed on this network"  
**解决**: 检查 .env.local 中的 NEXT_PUBLIC_CAMPAIGN_VAULT_BSC_TESTNET

### 问题 2: 资金不足
**现象**: "insufficient funds"  
**解决**: 从 BSC Testnet Faucet 获取 tBNB

### 问题 3: USDT 授权失败
**现象**: approve 交易失败  
**解决**: 确认 USDT 合约地址正确，余额充足

### 问题 4: payCampaign 失败
**现象**: "Campaign does not exist"  
**解决**: 确保先调用 createCampaign 再上链

---

## 测试脚本

使用 Hardhat/Foundry 编写自动化测试:

```typescript
// test/CampaignPayment.test.ts
describe("Campaign Payment Flow", () => {
  it("should complete full payment flow", async () => {
    // 1. Create campaign
    // 2. Approve USDT
    // 3. Pay campaign
    // 4. Verify state
  });
});
```

---

**测试负责人**: Dev  
**预计时间**: 2-4 小时  
**阻塞项**: 需要合约部署地址
