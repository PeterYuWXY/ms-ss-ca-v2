-- AlterTable
ALTER TABLE "Community" ADD COLUMN     "ownerTelegramId" TEXT;

-- CreateTable
CREATE TABLE "CommunityRating" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "engagement" INTEGER NOT NULL,
    "relevance" INTEGER NOT NULL,
    "quality" INTEGER NOT NULL,
    "speed" INTEGER NOT NULL,
    "professionalism" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityRating_campaignId_idx" ON "CommunityRating"("campaignId");

-- CreateIndex
CREATE INDEX "CommunityRating_communityId_idx" ON "CommunityRating"("communityId");

-- CreateIndex
CREATE INDEX "CommunityRating_advertiserId_idx" ON "CommunityRating"("advertiserId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityRating_campaignId_communityId_advertiserId_key" ON "CommunityRating"("campaignId", "communityId", "advertiserId");

-- CreateIndex
CREATE INDEX "Campaign_advertiserId_status_createdAt_idx" ON "Campaign"("advertiserId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CampaignExecution_caId_status_idx" ON "CampaignExecution"("caId", "status");

-- CreateIndex
CREATE INDEX "Offer_caId_status_idx" ON "Offer"("caId", "status");
