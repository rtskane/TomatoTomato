import { prisma } from "@/lib/prisma";
import type { RecipeSource } from "@/lib/recipe";

// The ONLY module that talks to Prisma for the Recipe table and its children.

type IngredientInput = {
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};

type RecipeFields = {
  title: string;
  description: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  coverImageUrl: string | null;
  ingredients: IngredientInput[];
  steps: string[];
};

// `source` is set once, at creation — an edit changes the recipe, not how it
// first arrived, so it's absent from the update shape below.
type CreateRecipeInput = RecipeFields & {
  cookbookId: string;
  authorId: string;
  source: RecipeSource | null;
};

// Editing can't move a recipe between cookbooks or reassign its author, so
// neither id appears here — the shape itself rules those out.
type UpdateRecipeInput = RecipeFields & { recipeId: string };

/**
 * The archived-recipe filter, defined once — the recipe-level twin of
 * `liveCookbook` in cookbook.repository. Every read that shows recipes to
 * people spreads this, including the counts on the shelf and in the archive
 * warning, so an archived recipe can't linger in a number.
 */
export const liveRecipe = { archivedAt: null } as const;

export const recipeRepository = {
  /**
   * Create a recipe with its ingredients and steps in one nested write.
   *
   * `position` is assigned from array index here — the service hands us the
   * list already ordered and stripped of blanks, so index IS the order the user
   * arranged. Doing it in a nested create keeps the whole recipe atomic: there
   * is no window where a recipe exists with half its steps.
   */
  create({
    cookbookId,
    authorId,
    source,
    title,
    description,
    servings,
    prepTimeMinutes,
    cookTimeMinutes,
    coverImageUrl,
    ingredients,
    steps,
  }: CreateRecipeInput) {
    return prisma.recipe.create({
      data: {
        cookbookId,
        authorId,
        source,
        title,
        description,
        servings,
        prepTimeMinutes,
        cookTimeMinutes,
        coverImageUrl,
        ingredients: {
          create: ingredients.map((ingredient, position) => ({
            position,
            name: ingredient.name,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
            note: ingredient.note,
          })),
        },
        steps: {
          create: steps.map((instruction, position) => ({
            position,
            instruction,
          })),
        },
      },
    });
  },

  /**
   * One recipe with its ingredients and steps in order, or `null` if this user
   * can't see it.
   *
   * Both ids come from the URL, so both are attacker-controlled. Three
   * conditions defend it, all in the `where` clause so a failure returns
   * nothing rather than partial data:
   *   - the recipe id itself
   *   - `cookbookId`, so a real recipe can't be rendered under a cookbook it
   *     doesn't belong to (which would show a misleading breadcrumb)
   *   - a membership row for this user on that cookbook
   *
   * `findFirst` rather than `findUnique` because that combination isn't a
   * unique index.
   */
  findDetailForUser(cookbookId: string, recipeId: string, userId: string) {
    return prisma.recipe.findFirst({
      where: {
        id: recipeId,
        cookbookId,
        ...liveRecipe,
        cookbook: { members: { some: { userId } } },
      },
      select: {
        id: true,
        title: true,
        description: true,
        servings: true,
        prepTimeMinutes: true,
        cookTimeMinutes: true,
        coverImageUrl: true,
        createdAt: true,
        // Needed to decide whether the viewer may edit it, not just to name it.
        authorId: true,
        author: {
          select: { username: true, firstName: true, lastName: true },
        },
        cookbook: { select: { id: true, title: true } },
        ingredients: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            name: true,
            quantity: true,
            unit: true,
            note: true,
          },
        },
        steps: {
          orderBy: { position: "asc" },
          select: { id: true, instruction: true },
        },
      },
    });
  },

  /**
   * The recipe's own row plus who wrote it and which cookbook it's in — the
   * three facts a permission check needs, without loading ingredients or steps.
   *
   * `cookbookId` is included in the lookup for the same reason as
   * `findDetailForUser`: both ids come from the URL, and a recipe must never be
   * acted on under a cookbook it doesn't belong to.
   *
   * Archived recipes are found too — restoring and deleting one is exactly
   * what needs to see them — so `archivedAt` comes back for the caller to check.
   */
  findForPermissionCheck(cookbookId: string, recipeId: string) {
    return prisma.recipe.findFirst({
      where: { id: recipeId, cookbookId },
      select: {
        id: true,
        authorId: true,
        cookbookId: true,
        title: true,
        coverImageUrl: true,
        archivedAt: true,
      },
    });
  },

  /**
   * Replace a recipe wholesale.
   *
   * Ingredients and steps are deleted and re-created rather than diffed. They
   * are ordered, positional, and have no identity the user cares about — a
   * diff would have to match rows to form fields that carry no id, and get
   * `position` right afterwards anyway. Recreating is exact and, in one
   * transaction, atomic: no window exists where the recipe has the old steps
   * and the new ingredients.
   */
  update({
    recipeId,
    title,
    description,
    servings,
    prepTimeMinutes,
    cookTimeMinutes,
    coverImageUrl,
    ingredients,
    steps,
  }: UpdateRecipeInput) {
    return prisma.recipe.update({
      where: { id: recipeId },
      data: {
        title,
        description,
        servings,
        prepTimeMinutes,
        cookTimeMinutes,
        coverImageUrl,
        ingredients: {
          deleteMany: {},
          create: ingredients.map((ingredient, position) => ({
            position,
            name: ingredient.name,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
            note: ingredient.note,
          })),
        },
        steps: {
          deleteMany: {},
          create: steps.map((instruction, position) => ({
            position,
            instruction,
          })),
        },
      },
      select: { id: true },
    });
  },

  /**
   * Archive / restore. The current state is part of the `where`, as in the
   * cookbook's own archive: archiving an archived recipe (or restoring a live
   * one) changes zero rows rather than silently rewriting the timestamp.
   */
  archive(recipeId: string) {
    return prisma.recipe.updateMany({
      where: { id: recipeId, ...liveRecipe },
      data: { archivedAt: new Date() },
    });
  },

  restore(recipeId: string) {
    return prisma.recipe.updateMany({
      where: { id: recipeId, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
  },

  /**
   * Delete for good. Only an archived recipe can go — a live one has to be
   * archived first, so nothing is ever one click from gone. Ingredients and
   * steps go with it; both are `onDelete: Cascade`.
   */
  deleteArchived(recipeId: string) {
    return prisma.recipe.deleteMany({
      where: { id: recipeId, archivedAt: { not: null } },
    });
  },

  /** A cookbook's archived recipes, most recently archived first. */
  listArchived(cookbookId: string) {
    return prisma.recipe.findMany({
      where: { cookbookId, archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
      select: { id: true, title: true, authorId: true },
    });
  },

  /** How many live recipes in this cookbook someone other than `ownerId` wrote. */
  countByOtherAuthors(cookbookId: string, ownerId: string) {
    return prisma.recipe.count({
      where: { cookbookId, authorId: { not: ownerId }, ...liveRecipe },
    });
  },
};
