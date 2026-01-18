-- CreateTable: FindingNote
CREATE TABLE "FindingNote" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "userId" TEXT,
    "content" VARCHAR(10000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: FindingNote indexes
CREATE INDEX "FindingNote_findingId_idx" ON "FindingNote"("findingId");
CREATE INDEX "FindingNote_findingId_createdAt_idx" ON "FindingNote"("findingId", "createdAt");

-- CreateIndex: Finding composite index for cross-scan dashboard queries
CREATE INDEX "Finding_status_severity_idx" ON "Finding"("status", "severity");

-- AddForeignKey: FindingNote -> Finding (cascade delete)
ALTER TABLE "FindingNote" ADD CONSTRAINT "FindingNote_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: FindingNote -> User (set null on delete)
ALTER TABLE "FindingNote" ADD CONSTRAINT "FindingNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
