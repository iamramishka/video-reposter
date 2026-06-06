-- CreateTable
CREATE TABLE "PackageDefinition" (
    "plan" "Plan" NOT NULL,
    "videoLimit" INTEGER NOT NULL,
    "templateLimit" INTEGER NOT NULL,
    "workerLimit" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageDefinition_pkey" PRIMARY KEY ("plan")
);

-- Seed package defaults
INSERT INTO "PackageDefinition" ("plan", "videoLimit", "templateLimit", "workerLimit", "updatedAt")
VALUES
    ('starter', 5, 2, 1, CURRENT_TIMESTAMP),
    ('pro', 50, 5, 2, CURRENT_TIMESTAMP),
    ('enterprise', 500, 5, 4, CURRENT_TIMESTAMP)
ON CONFLICT ("plan") DO NOTHING;
