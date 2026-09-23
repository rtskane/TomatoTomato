-- Invitations by username are gone: a cookbook is joined through its shared
-- link or a one-time link. The invite table now holds only one-time links, so
-- the columns that addressed an invite to a person go, and so do the statuses
-- only a person's answer could put a row in.
--
-- Rows addressed to a person are removed first, on purpose. Left in place with
-- their addressing columns dropped, a still-pending one would have become a
-- working one-time link — with a token nobody was ever sent — listed for the
-- owner as an unlabelled link they never made.

DELETE FROM "CookbookInvite"
  WHERE "invitedUserId" IS NOT NULL
     OR "email" IS NOT NULL
     OR "status" IN ('DECLINED', 'EXPIRED');

-- DropForeignKey
ALTER TABLE "CookbookInvite" DROP CONSTRAINT "CookbookInvite_invitedUserId_fkey";

-- DropIndex
DROP INDEX "CookbookInvite_cookbookId_invitedUserId_key";
DROP INDEX "CookbookInvite_cookbookId_email_key";
DROP INDEX "CookbookInvite_email_idx";
DROP INDEX "CookbookInvite_invitedUserId_idx";

-- AlterTable
ALTER TABLE "CookbookInvite" DROP COLUMN "invitedUserId", DROP COLUMN "email";

-- AlterEnum
BEGIN;
CREATE TYPE "InviteStatus_new" AS ENUM ('PENDING', 'ACCEPTED');
ALTER TABLE "CookbookInvite" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "CookbookInvite" ALTER COLUMN "status" TYPE "InviteStatus_new" USING ("status"::text::"InviteStatus_new");
ALTER TYPE "InviteStatus" RENAME TO "InviteStatus_old";
ALTER TYPE "InviteStatus_new" RENAME TO "InviteStatus";
DROP TYPE "InviteStatus_old";
ALTER TABLE "CookbookInvite" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;
