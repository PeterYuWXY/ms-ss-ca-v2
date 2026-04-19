# MS+SS+CA v2.0

去中心化Crypto营销众包平台

## 技术栈

- **前端**: Next.js 14 + Tailwind CSS + wagmi
- **后端**: Express + TypeScript + tRPC
- **数据库**: PostgreSQL (Supabase) + Redis (Upstash)
- **区块链**: Ethereum + BSC (BSC Testnet用于测试) + Gnosis Safe + Ethers.js/viem
- **Bot**: Telegraf (Telegram)
- **部署**: Vercel (前端) + Supabase (后端)

## 项目结构

```
├── apps/
│   ├── ms-web/          # Next.js前端 (广告主界面)
│   ├── ms-api/          # Express API (MS Core + SS)
│   └── ca-bot/          # Telegram Bot (CA)
├── packages/
│   ├── types/           # 共享TypeScript类型
│   ├── utils/           # 共享工具函数
│   ├── database/        # Prisma schema + 迁移
│   └── contracts/       # 智能合约
```

## 快速开始

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp apps/ms-api/.env.example apps/ms-api/.env.local
cp apps/ms-web/.env.example apps/ms-web/.env.local
cp apps/ca-bot/.env.example apps/ca-bot/.env.local

# 数据库迁移
pnpm db:migrate

# 开发模式
pnpm dev
```

## 环境变量

详见各app目录下的 `.env.example`

## 许可证

MIT
