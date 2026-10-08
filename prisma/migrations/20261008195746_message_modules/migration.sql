-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "dmOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "messageModuleId" TEXT;

-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "accessExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MessageModule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "introText" TEXT,
    "cards" JSONB NOT NULL,
    "utmSource" TEXT NOT NULL DEFAULT 'openreply',
    "utmMedium" TEXT NOT NULL DEFAULT 'dm',
    "utmCampaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "card" INTEGER NOT NULL,
    "slot" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleLinkClick" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "moduleLinkId" TEXT NOT NULL,
    "automationId" TEXT,
    "recipientHash" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleLinkClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageModule_workspaceId_idx" ON "MessageModule"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleLink_slug_key" ON "ModuleLink"("slug");

-- CreateIndex
CREATE INDEX "ModuleLink_workspaceId_idx" ON "ModuleLink"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleLink_moduleId_card_slot_key" ON "ModuleLink"("moduleId", "card", "slot");

-- CreateIndex
CREATE INDEX "ModuleLinkClick_workspaceId_createdAt_idx" ON "ModuleLinkClick"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ModuleLinkClick_moduleLinkId_idx" ON "ModuleLinkClick"("moduleLinkId");

-- CreateIndex
CREATE INDEX "ModuleLinkClick_automationId_idx" ON "ModuleLinkClick"("automationId");

-- CreateIndex
CREATE INDEX "Automation_messageModuleId_idx" ON "Automation"("messageModuleId");

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_messageModuleId_fkey" FOREIGN KEY ("messageModuleId") REFERENCES "MessageModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageModule" ADD CONSTRAINT "MessageModule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleLink" ADD CONSTRAINT "ModuleLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleLink" ADD CONSTRAINT "ModuleLink_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "MessageModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleLinkClick" ADD CONSTRAINT "ModuleLinkClick_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleLinkClick" ADD CONSTRAINT "ModuleLinkClick_moduleLinkId_fkey" FOREIGN KEY ("moduleLinkId") REFERENCES "ModuleLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleLinkClick" ADD CONSTRAINT "ModuleLinkClick_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
