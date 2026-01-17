/*
  Warnings:

  - You are about to drop the column `progress` on the `Scan` table. All the data in the column will be lost.
  - You are about to drop the column `targetUrl` on the `Scan` table. All the data in the column will be lost.
  - You are about to drop the column `workflowId` on the `Scan` table. All the data in the column will be lost.
  - The `status` column on the `Scan` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `targetUrl` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Made the column `projectId` on table `Scan` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "ScanSource" AS ENUM ('MANUAL', 'SCHEDULED', 'CICD', 'API');

-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('NONE', 'FORM', 'API_TOKEN', 'BASIC', 'SSO');

-- DropForeignKey
ALTER TABLE "Scan" DROP CONSTRAINT "Scan_projectId_fkey";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "repositoryUrl" TEXT,
ADD COLUMN     "targetUrl" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Scan" DROP COLUMN "progress",
DROP COLUMN "targetUrl",
DROP COLUMN "workflowId",
ADD COLUMN     "criticalCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentAgent" TEXT,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "findingsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "highCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lowCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mediumCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "progressPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source" "ScanSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "temporalWorkflowId" TEXT,
ALTER COLUMN "projectId" SET NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "startedAt" DROP NOT NULL,
ALTER COLUMN "startedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ScanResult" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "reportHtmlPath" TEXT,
    "reportPdfPath" TEXT,
    "reportMdPath" TEXT,
    "rawOutputPath" TEXT,
    "totalTokensUsed" INTEGER,
    "totalCostUsd" DECIMAL(10,4),
    "agentMetrics" JSONB,
    "executiveSummary" TEXT,
    "riskScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthenticationConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "method" "AuthMethod" NOT NULL,
    "encryptedCredentials" TEXT NOT NULL,
    "loginUrl" TEXT,
    "usernameSelector" TEXT,
    "passwordSelector" TEXT,
    "submitSelector" TEXT,
    "successIndicator" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpSelector" TEXT,
    "lastValidatedAt" TIMESTAMP(3),
    "validationStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthenticationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScanResult_scanId_key" ON "ScanResult"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthenticationConfig_projectId_key" ON "AuthenticationConfig"("projectId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_action_idx" ON "AuditLog"("organizationId", "action");

-- CreateIndex
CREATE INDEX "Finding_category_idx" ON "Finding"("category");

-- CreateIndex
CREATE INDEX "Finding_scanId_severity_idx" ON "Finding"("scanId", "severity");

-- CreateIndex
CREATE INDEX "Finding_scanId_status_idx" ON "Finding"("scanId", "status");

-- CreateIndex
CREATE INDEX "Invitation_status_idx" ON "Invitation"("status");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_status_idx" ON "Invitation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Organization_plan_idx" ON "Organization"("plan");

-- CreateIndex
CREATE INDEX "Organization_createdAt_idx" ON "Organization"("createdAt");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_idx" ON "OrganizationMembership"("userId");

-- CreateIndex
CREATE INDEX "OrganizationMembership_role_idx" ON "OrganizationMembership"("role");

-- CreateIndex
CREATE INDEX "Scan_status_idx" ON "Scan"("status");

-- CreateIndex
CREATE INDEX "Scan_createdAt_idx" ON "Scan"("createdAt");

-- CreateIndex
CREATE INDEX "Scan_temporalWorkflowId_idx" ON "Scan"("temporalWorkflowId");

-- CreateIndex
CREATE INDEX "Scan_organizationId_createdAt_idx" ON "Scan"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Scan_organizationId_status_idx" ON "Scan"("organizationId", "status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanResult" ADD CONSTRAINT "ScanResult_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthenticationConfig" ADD CONSTRAINT "AuthenticationConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
