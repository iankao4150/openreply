-- Opt-outs are keyed by the Instagram account id so they survive reconnecting
-- the account (which creates a new InstagramAccount row).
ALTER TABLE "DmOptOut" RENAME COLUMN "instagramAccountId" TO "instagramId";
UPDATE "DmOptOut" o SET "instagramId" = a."instagramId"
  FROM "InstagramAccount" a WHERE a."id" = o."instagramId";
ALTER INDEX "DmOptOut_instagramAccountId_userId_key" RENAME TO "DmOptOut_instagramId_userId_key";
ALTER INDEX "DmOptOut_instagramAccountId_idx" RENAME TO "DmOptOut_instagramId_idx";
