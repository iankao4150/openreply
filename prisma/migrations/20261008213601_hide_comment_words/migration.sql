-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "hideCommentWords" TEXT[] DEFAULT ARRAY[]::TEXT[];
