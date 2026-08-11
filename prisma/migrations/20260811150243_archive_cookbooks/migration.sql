-- Archiving a cookbook is a soft delete: `Recipe.cookbookId` is onDelete
-- Cascade, so a real delete would destroy every recipe inside — including ones
-- other members wrote. Nullable, so every existing cookbook is live.

-- AlterTable
ALTER TABLE "Cookbook" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Cookbook_ownerId_archivedAt_idx" ON "Cookbook"("ownerId", "archivedAt");
