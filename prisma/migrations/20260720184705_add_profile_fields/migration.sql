-- AlterTable
ALTER TABLE "User" DROP COLUMN "displayName",
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

