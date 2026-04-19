-- CreateEnum
CREATE TYPE "SkillCategory" AS ENUM ('shilling', 'seo', 'kol', 'content');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('telegram');

-- CreateEnum
CREATE TYPE "CommunityStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'pending', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "CampaignCommunityStatus" AS ENUM ('pending', 'accepted', 'rejected', 'executing', 'completed');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('pending', 'accepted', 'rejected', 'executing', 'completed');

-- CreateEnum
CREATE TYPE "CAStatus" AS ENUM ('active', 'inactive', 'suspended');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'released', 'refunded');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('pending', 'accepted', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "SkillCategory" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Community" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'telegram',
    "language" TEXT[],
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "rankings" JSONB NOT NULL DEFAULT '{}',
    "activity" JSONB NOT NULL DEFAULT '{}',
    "caBotId" TEXT,
    "ownerWallet" TEXT NOT NULL,
    "status" "CommunityStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "advertiserWallet" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "timeline" JSONB NOT NULL DEFAULT '{}',
    "performance" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignCommunity" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "status" "CampaignCommunityStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignCommunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignExecution" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "caId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'pending',
    "shillingData" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityAgent" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "ownerWallet" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reputation" JSONB NOT NULL DEFAULT '{}',
    "apiKeyHash" TEXT,
    "status" "CAStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPayment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "totalAmount" TEXT NOT NULL,
    "platformFee" TEXT NOT NULL,
    "caReward" TEXT NOT NULL,
    "vaultAddress" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionPayment" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "txHash" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Earning" (
    "id" TEXT NOT NULL,
    "caId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "txHash" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Earning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "caId" TEXT NOT NULL,
    "task" JSONB NOT NULL,
    "reward" JSONB NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "executionStart" TIMESTAMP(3) NOT NULL,
    "executionEnd" TIMESTAMP(3) NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Advertiser" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "totalSpent" TEXT NOT NULL DEFAULT '0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Advertiser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Skill_category_idx" ON "Skill"("category");

-- CreateIndex
CREATE INDEX "Community_platform_status_idx" ON "Community"("platform", "status");

-- CreateIndex
CREATE INDEX "Community_memberCount_idx" ON "Community"("memberCount");

-- CreateIndex
CREATE INDEX "Community_category_idx" ON "Community"("category");

-- CreateIndex
CREATE INDEX "Campaign_advertiserId_idx" ON "Campaign"("advertiserId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_skillId_idx" ON "Campaign"("skillId");

-- CreateIndex
CREATE INDEX "CampaignCommunity_campaignId_idx" ON "CampaignCommunity"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignCommunity_communityId_idx" ON "CampaignCommunity"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignCommunity_campaignId_communityId_key" ON "CampaignCommunity"("campaignId", "communityId");

-- CreateIndex
CREATE INDEX "CampaignExecution_campaignId_idx" ON "CampaignExecution"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignExecution_communityId_idx" ON "CampaignExecution"("communityId");

-- CreateIndex
CREATE INDEX "CampaignExecution_caId_idx" ON "CampaignExecution"("caId");

-- CreateIndex
CREATE INDEX "CampaignExecution_status_idx" ON "CampaignExecution"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityAgent_botId_key" ON "CommunityAgent"("botId");

-- CreateIndex
CREATE INDEX "CommunityAgent_botId_idx" ON "CommunityAgent"("botId");

-- CreateIndex
CREATE INDEX "CommunityAgent_ownerWallet_idx" ON "CommunityAgent"("ownerWallet");

-- CreateIndex
CREATE INDEX "CommunityAgent_status_idx" ON "CommunityAgent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPayment_campaignId_key" ON "CampaignPayment"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignPayment_campaignId_idx" ON "CampaignPayment"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignPayment_status_idx" ON "CampaignPayment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionPayment_executionId_key" ON "ExecutionPayment"("executionId");

-- CreateIndex
CREATE INDEX "ExecutionPayment_executionId_idx" ON "ExecutionPayment"("executionId");

-- CreateIndex
CREATE INDEX "ExecutionPayment_status_idx" ON "ExecutionPayment"("status");

-- CreateIndex
CREATE INDEX "Earning_caId_idx" ON "Earning"("caId");

-- CreateIndex
CREATE INDEX "Earning_status_idx" ON "Earning"("status");

-- CreateIndex
CREATE INDEX "Offer_campaignId_idx" ON "Offer"("campaignId");

-- CreateIndex
CREATE INDEX "Offer_caId_idx" ON "Offer"("caId");

-- CreateIndex
CREATE INDEX "Offer_status_idx" ON "Offer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Advertiser_walletAddress_key" ON "Advertiser"("walletAddress");

-- CreateIndex
CREATE INDEX "Advertiser_walletAddress_idx" ON "Advertiser"("walletAddress");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCommunity" ADD CONSTRAINT "CampaignCommunity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCommunity" ADD CONSTRAINT "CampaignCommunity_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignExecution" ADD CONSTRAINT "CampaignExecution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignExecution" ADD CONSTRAINT "CampaignExecution_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignExecution" ADD CONSTRAINT "CampaignExecution_caId_fkey" FOREIGN KEY ("caId") REFERENCES "CommunityAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPayment" ADD CONSTRAINT "CampaignPayment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPayment" ADD CONSTRAINT "ExecutionPayment_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "CampaignExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Earning" ADD CONSTRAINT "Earning_caId_fkey" FOREIGN KEY ("caId") REFERENCES "CommunityAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
