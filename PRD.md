# MS+SS+CA v1.0 - Product Requirements Document

## 1. 产品概述

### 1.1 产品定位

去中心化Crypto营销平台，连接**广告主（Advertisers）**与**Telegram群主（Community Owners）**，通过标准化的营销服务交付实现可信赖的链上结算。

### 1.2 核心价值主张

| 用户类型 | 核心价值 |
|---------|---------|
| 广告主 | 一键触达多个优质Telegram社区，预付锁仓保障资金安全，按实际完成度结算 |
| Telegram群主 | 通过CA Bot接单即可赚取稳定USDT收益，无需编程能力 |
| 平台 | 每笔交易收取30%服务费，智能合约自动分配无需人工干预 |

### 1.3 两类核心用户流程

#### 广告主流程
```
登录（钱包连接）
  → 创建推广活动（选技能/选社区/设预算）
  → 支付 USDT 到 MSVault 合约
  → Dashboard 实时追踪完成进度和支付状态
  → 活动完成后对各社区打分（5维度雷达图）
```

#### Telegram群主流程
```
访问 MS 平台 → 点击「Claim CA Bot」
  → 跳转到 Telegram（深链接 t.me/BotName?start=register_{WALLET}）
  → CA Bot 引导：将 Bot 添加为群管理员
  → Bot 自动注册社区（群 ID + 群主钱包绑定）
  → 收到推广任务 Offer → 接受/拒绝
  → Bot 辅助执行：发帖/置顶/发起讨论
  → 任务完成确认 → USDT 自动到账
```

---

## 2. 系统架构

### 2.1 技术栈

| 层次 | 技术选型 |
|------|---------|
| 前端 | Next.js 14 + Tailwind CSS + wagmi v2 + viem |
| 后端 | Express + TypeScript + Prisma ORM |
| 数据库 | PostgreSQL |
| 区块链 | Solidity + BSC Testnet (Chain ID 97) + USDT ERC-20 |
| CA Bot | Telegraf 框架 (Telegram) |
| 构建 | pnpm workspaces + Turbo |

### 2.2 模块划分

| 模块 | 代码路径 | 职责 |
|------|----------|------|
| MS Platform | `apps/ms-web` | 广告主界面 + 群主 Claim CA Bot 入口 |
| MS API | `apps/ms-api` | 核心业务逻辑、offer 分发、评分 |
| SS Engine | `apps/ms-api/src/services` | 营销执行验证和评分计算 |
| CA Bot | `apps/ca-bot` | Telegram Bot，群主全流程交互 |
| Smart Contract | `packages/contracts` | MSCampaignVault.sol，资金托管和分配 |
| Shared Packages | `packages/utils`, `packages/database` | 定价工具、Prisma 客户端 |

### 2.3 核心数据流

```
广告主在 MS 平台创建 Campaign
  → confirm-payment: 合约锁仓 + API 创建 Offer 记录
  → MS 推送 Offer 通知到各社区的 CA Bot
  → CA Bot 群主接受 → 执行任务 → 上报进度
  → SS Engine 验证执行质量
  → 所有社区完成 → 触发合约 completeCampaign
      → 70% 分配给 CA 钱包，30% 平台
      → 未完成的 Offer → 退款给广告主
  → 广告主对各社区打分（5维度）
```

---

## 3. 1.0 功能范围

### 3.1 MS Platform（前端）

#### 广告主侧

- [x] 钱包连接（wagmi + MetaMask/WalletConnect）
- [x] Dashboard：活动列表、状态概览
- [x] 创建活动向导（5步骤）：
  1. 选择技能类型（Shilling）
  2. 配置参数（推广时长、社区数量）
  3. 选择目标社区
  4. 填写项目信息和预算
  5. 预览和支付（调用合约）
- [x] 支付确认：调用 MSVault.payCampaign()
- [ ] 活动详情页：完成进度 + 各社区执行状态
- [ ] 社区评分页：5维度雷达图打分（完成后解锁）

#### 群主侧

- [ ] "Become a CA" 入口页（`/become-ca`）
  - 展示群主收益模型
  - 「Claim CA Bot」按钮 → 生成 Telegram 深链接

### 3.2 MS API（后端）

- [x] `GET/POST /api/v1/campaigns` — 活动 CRUD
- [x] `POST /api/v1/campaigns/:id/confirm-payment` — 确认支付
- [x] `GET /api/v1/communities` — 社区列表
- [x] `GET /api/v1/pricing` — 价格计算
- [x] `GET /api/v1/skills` — 技能类型
- [x] `GET/POST /ca/v1/offers` — CA Offer 管理
- [x] `POST /ca/v1/offers/:id/accept` — 接受 Offer
- [x] `POST /ca/v1/offers/:id/reject` — 拒绝 Offer
- [x] `GET /ca/v1/executions` — 执行列表
- [x] `POST /ca/v1/executions/:id/complete` — 完成执行
- [ ] `POST /ca/v1/communities/register` — 社区注册（Bot 调用）
- [ ] `POST /api/v1/campaigns/:id/distribute-offers` — 分发 Offer 给各社区 CA
- [ ] `POST /api/v1/campaigns/:id/ratings` — 广告主对社区打分
- [ ] `GET /api/v1/campaigns/:id/ratings` — 获取评分数据

### 3.3 CA Bot

- [x] `/start` — 欢迎和命令列表
- [x] `/offers` — 查看待处理报价（含接受/拒绝按钮）
- [x] `/tasks` — 查看执行中任务
- [x] `/earnings` — 收益查询
- [ ] 深链接注册：`/start register_{WALLET_ADDRESS}` → 引导群主入驻流程
  1. Bot 提示：「请将我添加到你的群并设为管理员」
  2. 群主将 Bot 添加为管理员后在群中发 `/register`
  3. Bot 自动识别群 ID、群名称、成员数
  4. 完成注册，绑定 WALLET_ADDRESS
- [ ] 执行辅助：收到任务后引导发帖/置顶/发起讨论

### 3.4 SS Engine（执行验证）

- [x] Shilling 执行验证逻辑（validateShillingExecution）
- [x] 任务完成度评分（0-100分）
  - Pinned Post: 30分
  - Group Ads: 每项10分（最高30分）
  - Discussions: 每项20分（最高40分）
  - 及格线: 70分
- [x] CA 声誉计算
- [ ] 活动完成触发器：所有执行完成后自动调用合约

### 3.5 智能合约

- [x] MSCampaignVault.sol：资金托管合约
- [x] 合约功能：
  - `createCampaign` — 创建活动（Owner 调用）
  - `payCampaign` — 广告主支付锁仓
  - `completeCampaign` — 完成并分配（70% CA + 30% 平台）
  - `cancelCampaign` — 取消并退款
- [x] BSC Testnet 部署和测试
- [x] Hardhat 合约测试（24个测试用例）

---

## 4. 数据模型

### 4.1 定价表

| 时长 | 10社区 | 30社区 | 50社区 |
|------|--------|--------|--------|
| 1天 | 1 USDT (测试) | 2 USDT | 3 USDT |
| 1周 | 5 USDT | 10 USDT | 15 USDT |
| 1月 | 10 USDT | 20 USDT | 30 USDT |

> 注：以上为测试网金额，生产环境将调整为实际市场价格（参考 PRD 附录）

**分成比例**：70% CA 奖励池 / 30% 平台

### 4.2 状态流转

```
Campaign:   draft → pending → active → completed
                  ↘                  ↗
                   cancelled ←──────

Execution:  pending → accepted → executing → completed
                   ↘
                    rejected

Offer:      pending → accepted → rejected
                              ↘ expired
```

### 4.3 社区评分模型（CommunityRating）

每次活动结束后，广告主可对参与社区进行评分：

| 维度 | 说明 | 分值 |
|------|------|------|
| Engagement | 群内互动活跃度 | 1-5 |
| Relevance | 社区与项目的相关性 | 1-5 |
| Quality | 推广内容质量 | 1-5 |
| Speed | 执行响应速度 | 1-5 |
| Professionalism | 专业度和态度 | 1-5 |

结果以**雷达图（Spider Chart）**展示在活动详情页。

### 4.4 数据库表清单（共12张）

| 表名 | 用途 |
|------|------|
| Skill | 服务类型定义 |
| Community | 社区信息 |
| Campaign | 营销活动 |
| CampaignCommunity | 活动-社区关联 |
| CampaignExecution | 执行记录 |
| CommunityAgent | CA Bot 代理 |
| CampaignPayment | 活动支付 |
| ExecutionPayment | 执行支付 |
| Earning | CA 收益记录 |
| Offer | 任务报价 |
| Advertiser | 广告主 |
| **CommunityRating** | **社区评分（新增）** |

---

## 5. API 规范

### 5.1 统一响应格式

```json
{
  "success": true,
  "data": {},
  "pagination": { "total": 100, "limit": 20, "offset": 0, "hasMore": true }
}
```

错误响应：
```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Campaign not found" }
}
```

### 5.2 CA Bot 认证

CA Bot 调用 `/ca/v1/*` 接口时需携带：
- `X-CA-Bot-ID: {botId}` — Bot 标识
- `X-CA-API-Key: {apiKey}` — API 密钥（SHA-256 哈希存储）

---

## 6. 安全要求

- [x] API 限流（helmet）
- [x] CA Bot API Key 哈希验证
- [x] 合约 Owner 权限控制
- [x] 定价服务端验证（防止客户端篡改）
- [x] 分页输入校验（NaN/负数防护）
- [ ] Zod 全面输入验证（CA 注册接口）

---

## 7. 部署配置

### 7.1 环境变量

```env
# Database
DATABASE_URL=postgresql://...

# API
PORT=3001

# Blockchain (BSC Testnet)
PRIVATE_KEY=0x...
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545/
USDT_ADDRESS=0x337610d27c682E347C9cD60BD4b3b107C9d34dDd  # BSC Testnet USDT
VAULT_ADDRESS=0x...  # 已部署合约地址
PLATFORM_WALLET=0x...

# Bot
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=MSCommunityBot
MS_API_URL=http://localhost:3001
CA_BOT_ID=...
CA_API_KEY=...
```

### 7.2 部署步骤

```bash
# 1. 安装依赖
pnpm install

# 2. 数据库迁移
pnpm db:migrate

# 3. 种子数据
pnpm db:seed

# 4. 编译
pnpm build

# 5. 合约部署（BSC Testnet）
cd packages/contracts
npx hardhat run scripts/deploy.ts --network bscTestnet

# 6. 启动服务
pnpm dev
```

---

## 8. 2.0 规划（超出当前范围）

以下功能将在 2.0 版本实现：

| 功能 | 说明 |
|------|------|
| 双子金库 | 每个活动支持 USDT 金库 + 项目代币金库二选一或并用 |
| 更多营销技能 | KOL 合作、SEO 内容、空投推广等 |
| 动态定价 | 根据社区评分和历史表现自动调整报价 |
| 多链支持 | Ethereum、Base、Solana 等 |
| 广告主评级 | 基于历史支付记录的广告主可信度评分 |
| 自动化验证 | Telegram API 自动验证帖子和互动数据 |

---

## 9. 附录：生产环境定价参考

| 时长 | 10社区 | 30社区 | 50社区 |
|------|--------|--------|--------|
| 1天 | 500 USDT | 1,200 USDT | 1,800 USDT |
| 1周 | 2,500 USDT | 6,000 USDT | 9,000 USDT |
| 1月 | 8,000 USDT | 18,000 USDT | 27,000 USDT |
