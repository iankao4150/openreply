-- DropIndex
DROP INDEX "ModuleLink_moduleId_card_slot_key";

-- AlterTable
ALTER TABLE "ModuleLink" ADD COLUMN     "cardKey" TEXT,
ADD COLUMN     "retiredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ModuleLink_moduleId_retiredAt_idx" ON "ModuleLink"("moduleId", "retiredAt");
