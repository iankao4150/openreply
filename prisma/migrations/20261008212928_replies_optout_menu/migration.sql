-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "commentReplyStyle" TEXT NOT NULL DEFAULT 'CARDS',
ADD COLUMN     "textOpener" TEXT;

-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "persistentMenu" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "DmOptOut" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DmOptOut_instagramAccountId_idx" ON "DmOptOut"("instagramAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "DmOptOut_instagramAccountId_userId_key" ON "DmOptOut"("instagramAccountId", "userId");
