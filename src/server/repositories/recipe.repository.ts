import { prisma } from "@/lib/prisma";

// The ONLY module that talks to Prisma for the Recipe table and its children.

type IngredientInput = {
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};

type CreateRecipeInput = {
  cookbookId: string;
  authorId: string;
  title: string;
  description: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  ingredients: IngredientInput[];
  steps: string[];
};

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
    title,
    description,
    servings,
    prepTimeMinutes,
    cookTimeMinutes,
    ingredients,
    steps,
  }: CreateRecipeInput) {
    return prisma.recipe.create({
      data: {
        cookbookId,
        authorId,
        title,
        description,
        servings,
        prepTimeMinutes,
        cookTimeMinutes,
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
        cookbook: { members: { some: { userId } } },
      },
      select: {
        id: true,
        title: true,
        description: true,
        servings: true,
        prepTimeMinutes: true,
        cookTimeMinutes: true,
        createdAt: true,
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
};
