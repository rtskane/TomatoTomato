-- One-time invite links: an invite addressed to neither an account nor an
-- email, used by whoever holds its token first. They reuse the invite table
-- as-is — a token, an expiry and a status are exactly what a single-use link
-- needs — so the only new column is an optional label to tell them apart.
--
-- Purely additive: existing invites keep a NULL label and behave unchanged.

-- AlterTable
ALTER TABLE "CookbookInvite" ADD COLUMN "label" TEXT;
