-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "apiKeyId" TEXT,
ADD COLUMN     "parentScanId" TEXT,
ADD COLUMN     "queuedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "APIKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['scan:read', 'scan:write']::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "APIKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceReportJob" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "template" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "outputPath" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceReportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "APIKey_keyPrefix_key" ON "APIKey"("keyPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "APIKey_keyHash_key" ON "APIKey"("keyHash");

-- CreateIndex
CREATE INDEX "APIKey_organizationId_idx" ON "APIKey"("organizationId");

-- CreateIndex
CREATE INDEX "APIKey_keyHash_idx" ON "APIKey"("keyHash");

-- CreateIndex
CREATE INDEX "APIKey_keyPrefix_idx" ON "APIKey"("keyPrefix");

-- CreateIndex
CREATE INDEX "ServiceReportJob_scanId_idx" ON "ServiceReportJob"("scanId");

-- CreateIndex
CREATE INDEX "ServiceReportJob_organizationId_idx" ON "ServiceReportJob"("organizationId");

-- CreateIndex
CREATE INDEX "ServiceReportJob_status_idx" ON "ServiceReportJob"("status");

-- CreateIndex
CREATE INDEX "Scan_parentScanId_idx" ON "Scan"("parentScanId");

-- CreateIndex
CREATE INDEX "Scan_apiKeyId_idx" ON "Scan"("apiKeyId");

-- AddForeignKey
ALTER TABLE "APIKey" ADD CONSTRAINT "APIKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReportJob" ADD CONSTRAINT "ServiceReportJob_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReportJob" ADD CONSTRAINT "ServiceReportJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_parentScanId_fkey" FOREIGN KEY ("parentScanId") REFERENCES "Scan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "APIKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
