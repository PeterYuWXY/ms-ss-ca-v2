#!/bin/bash
# 完整修复脚本 - 2026-04-06

set -e

echo "🚀 开始完整构建修复..."

cd ~/projects/ms-ss-ca-v2

echo "📦 Step 1: 重新生成 Prisma 客户端..."
pnpm db:generate

echo "🔨 Step 2: 清理并重新构建..."
pnpm clean 2>/dev/null || true
rm -rf apps/ms-api/dist apps/ms-web/.next apps/ca-bot/dist

echo "📦 Step 3: 安装依赖..."
pnpm install

echo "🔨 Step 4: 构建所有包..."
pnpm build

echo "🧪 Step 5: 运行测试..."
pnpm test

echo "✅ 构建完成！"
