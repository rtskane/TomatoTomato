-- A cookbook's cover is now designed rather than assigned: the owner picks a
-- colour and a style instead of taking whatever the id hashed to.

-- CreateEnum
CREATE TYPE "CoverStyle" AS ENUM ('TITLED', 'PLAIN', 'PHOTO');

-- AlterTable
-- Nullable with no default: NULL means "nobody has chosen", which stays
-- distinguishable from a deliberate pick and lets the id-derived suggestion be
-- re-derived when the palette changes.
ALTER TABLE "Cookbook" ADD COLUMN     "coverColor" INTEGER;

-- Defaulted rather than nullable: every cover has to render as something, and
-- TITLED is what a cookbook without a photo already looked like.
ALTER TABLE "Cookbook" ADD COLUMN     "coverStyle" "CoverStyle" NOT NULL DEFAULT 'TITLED';

-- Backfill. Before this migration, "has a coverImageUrl" *was* the whole rule
-- for showing a photo, so every existing row with one is a PHOTO cover. Without
-- this line every cookbook with an uploaded cover would silently fall back to
-- its cloth colour on the next deploy — the picture would still be in blob
-- storage and still be in the column, and simply stop being shown.
UPDATE "Cookbook" SET "coverStyle" = 'PHOTO' WHERE "coverImageUrl" IS NOT NULL;
