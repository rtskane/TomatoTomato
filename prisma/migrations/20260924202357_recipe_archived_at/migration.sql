-- DropIndex
DROP INDEX "Recipe_cookbookId_idx";

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Recipe_cookbookId_archivedAt_idx" ON "Recipe"("cookbookId", "archivedAt");
