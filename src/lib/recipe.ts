import { z } from "zod";

// Validation for recipe input, including its ordered child collections.

export const recipeTitleSchema = z
  .string()
  .trim()
  .min(1, "Give your recipe a title.")
  .max(120, "Title must be 120 characters or fewer.");

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

// Numeric fields arrive from FormData as strings, and blank means "not stated"
// rather than zero. Coercing "" to 0 would claim a recipe serves nobody, so
// empty becomes undefined and only real digits are parsed.
const optionalPositiveInt = (max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional()
    .refine((v) => v === undefined || /^\d+$/.test(v), `${label} must be a whole number.`)
    .transform((v) => (v === undefined ? undefined : Number(v)))
    .refine((v) => v === undefined || v >= 1, `${label} must be at least 1.`)
    .refine((v) => v === undefined || v <= max, `${label} looks too large.`);

// An ingredient needs a name; quantity/unit/note are all optional. Quantity is
// a Float in the schema, so "0.5" is valid.
export const ingredientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Every ingredient needs a name.")
    .max(120, "Ingredient name is too long."),
  quantity: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional()
    .refine(
      (v) => v === undefined || (/^\d*\.?\d+$/.test(v) && Number(v) > 0),
      "Quantity must be a positive number.",
    )
    .transform((v) => (v === undefined ? undefined : Number(v))),
  unit: optionalText(30, "Unit is too long."),
  note: optionalText(200, "Ingredient note is too long."),
});

export const stepSchema = z.object({
  instruction: z
    .string()
    .trim()
    .min(1, "Every step needs an instruction.")
    .max(1000, "That step is too long."),
});

export const createRecipeSchema = z.object({
  title: recipeTitleSchema,
  description: optionalText(1000, "Description must be 1000 characters or fewer."),
  servings: optionalPositiveInt(100, "Servings"),
  prepTimeMinutes: optionalPositiveInt(10_000, "Prep time"),
  cookTimeMinutes: optionalPositiveInt(10_000, "Cook time"),
  // A recipe with no ingredients or no steps isn't a recipe. Order is carried
  // by array position — the caller strips blank rows before validating, so an
  // index here is the final `position` value.
  ingredients: z
    .array(ingredientSchema)
    .min(1, "Add at least one ingredient.")
    .max(100, "That's a lot of ingredients."),
  steps: z
    .array(stepSchema)
    .min(1, "Add at least one step.")
    .max(100, "That's a lot of steps."),
});

export type CreateRecipeParsed = z.infer<typeof createRecipeSchema>;
