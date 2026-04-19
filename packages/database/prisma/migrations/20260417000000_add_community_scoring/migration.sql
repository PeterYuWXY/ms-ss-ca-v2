-- Add scoring and referral fields to Community table

ALTER TABLE "Community"
  ADD COLUMN IF NOT EXISTS "telegramHandle"       TEXT,
  ADD COLUMN IF NOT EXISTS "scoreCache"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "memberCountUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "referralCode"         TEXT,
  ADD COLUMN IF NOT EXISTS "referredBy"           TEXT,
  ADD COLUMN IF NOT EXISTS "referralCount"        INTEGER NOT NULL DEFAULT 0;

-- Unique constraint on referralCode (sparse — only non-null values are unique)
CREATE UNIQUE INDEX IF NOT EXISTS "Community_referralCode_key"
  ON "Community" ("referralCode")
  WHERE "referralCode" IS NOT NULL;
