-- CreateTable
CREATE TABLE "AiImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiImport_userId_createdAt_idx" ON "AiImport"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiImport" ADD CONSTRAINT "AiImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
