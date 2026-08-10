-- An invite can now be addressed EITHER to an existing account
-- (`invitedUserId`) or to an email that has none yet, so `email` becomes
-- nullable. Exactly-one-of is enforced in inviteRepository, not here: Prisma
-- can't declare a CHECK constraint, and one added by hand would be dropped as
-- drift by the next `migrate diff`.

-- AlterTable
ALTER TABLE "CookbookInvite" ADD COLUMN     "invitedUserId" TEXT,
-- Prisma generates this column as NOT NULL with no default, which fails on a
-- table that already has rows. The default only has to cover backfill —
-- @updatedAt keeps it current from the application side afterwards.
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "CookbookInvite_invitedUserId_idx" ON "CookbookInvite"("invitedUserId");

-- One invite row per (cookbook, person); re-inviting upserts. Postgres treats
-- NULLs as distinct, so these two constraints don't interfere: account-invites
-- have email NULL and collide only on the first, email-invites have
-- invitedUserId NULL and collide only on the second.
-- CreateIndex
CREATE UNIQUE INDEX "CookbookInvite_cookbookId_invitedUserId_key" ON "CookbookInvite"("cookbookId", "invitedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CookbookInvite_cookbookId_email_key" ON "CookbookInvite"("cookbookId", "email");

-- AddForeignKey
ALTER TABLE "CookbookInvite" ADD CONSTRAINT "CookbookInvite_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
