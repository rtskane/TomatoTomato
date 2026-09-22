-- "Anyone with this link can join": one link per cookbook, off until the owner
-- turns it on.
--
-- Purely additive. The token is nullable and starts null (every link off), and
-- the role defaults to VIEWER, so no existing cookbook changes behaviour and
-- the other checkouts sharing this database keep working unchanged.

-- AlterTable
ALTER TABLE "Cookbook"
  ADD COLUMN "joinLinkToken" TEXT,
  ADD COLUMN "joinLinkRole"  "CookbookRole" NOT NULL DEFAULT 'VIEWER';

-- CreateIndex
CREATE UNIQUE INDEX "Cookbook_joinLinkToken_key" ON "Cookbook"("joinLinkToken");
