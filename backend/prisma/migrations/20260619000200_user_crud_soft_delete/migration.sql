ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "retentionUntil" TIMESTAMP(3);

ALTER TABLE "License" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "License" ADD COLUMN "retentionUntil" TIMESTAMP(3);

CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
CREATE INDEX "License_deletedAt_idx" ON "License"("deletedAt");
