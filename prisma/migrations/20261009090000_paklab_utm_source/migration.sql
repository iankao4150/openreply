-- Rebranded: links say utm_source=paklab. Modules still on the old default
-- move with it, and so do the tracked links already built from them (their
-- slugs stay, so DMs already sent keep working).
ALTER TABLE "MessageModule" ALTER COLUMN "utmSource" SET DEFAULT 'paklab';
UPDATE "ModuleLink" l SET "destinationUrl" = replace(l."destinationUrl", 'utm_source=openreply', 'utm_source=paklab')
  FROM "MessageModule" m WHERE m."id" = l."moduleId" AND m."utmSource" = 'openreply';
UPDATE "MessageModule" SET "utmSource" = 'paklab' WHERE "utmSource" = 'openreply';
