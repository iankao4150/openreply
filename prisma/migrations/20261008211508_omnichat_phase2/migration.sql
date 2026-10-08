-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "cooldownMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dmRuleType" TEXT NOT NULL DEFAULT 'KEYWORD',
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "iceBreakerQuestion" TEXT,
ADD COLUMN     "oncePerUser" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "humanPauseMinutes" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "MessageModule" ADD COLUMN     "quickReplies" JSONB NOT NULL DEFAULT '[]';
