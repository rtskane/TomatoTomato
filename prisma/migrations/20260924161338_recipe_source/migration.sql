-- CreateEnum
CREATE TYPE "RecipeSource" AS ENUM ('FORM', 'PASTE', 'LINK', 'VIDEO', 'PHOTO');

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "source" "RecipeSource";
