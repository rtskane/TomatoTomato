-- A cover is now composed rather than just coloured: a weave on the cloth, a
-- title treatment, and a focal point for the photograph.
--
-- Every column is NOT NULL with a default, and every default reproduces how
-- covers already looked, so no existing cookbook changes appearance. That is
-- why there is no backfill statement here — unlike the previous migration,
-- the defaults *are* the backfill.

-- CreateEnum
CREATE TYPE "CoverTexture" AS ENUM ('NONE', 'LINEN', 'GRID');
CREATE TYPE "CoverTitleFont" AS ENUM ('SERIF', 'SANS');
CREATE TYPE "CoverTitleSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');
CREATE TYPE "CoverTitlePosition" AS ENUM ('TOP', 'CENTER', 'BOTTOM');

-- AlterTable
ALTER TABLE "Cookbook"
  ADD COLUMN "coverTexture"       "CoverTexture"       NOT NULL DEFAULT 'NONE',
  ADD COLUMN "coverTitleFont"     "CoverTitleFont"     NOT NULL DEFAULT 'SERIF',
  ADD COLUMN "coverTitleSize"     "CoverTitleSize"     NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "coverTitlePosition" "CoverTitlePosition" NOT NULL DEFAULT 'CENTER';

-- Fractions of the image, not pixels: the same cover is drawn at 240px, 128px
-- and 36px, and a focal point in pixels would land on a different part of the
-- picture at each size.
ALTER TABLE "Cookbook"
  ADD COLUMN "coverFocalX" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "coverFocalY" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "coverZoom"   DOUBLE PRECISION NOT NULL DEFAULT 1;
