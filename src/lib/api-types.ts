// The shapes /api/v1 sends and accepts — the contract with the phone app.
//
// This file must import nothing. The app reads it directly, and anything it
// pulled in (Prisma's generated types, next/*, a service) would have to
// resolve in the app's build too. So the shapes are written out here rather
// than re-exported from the services, and each route checks what it sends
// against them with `satisfies`: a service that renames, drops or retypes a
// field fails the typecheck here, instead of failing on someone's phone. (A
// field the service adds passes silently — the app just doesn't know of it
// until it's added here.)

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Machine-readable reasons, so the app never has to match on prose. */
export type ApiErrorCode =
  | "unauthenticated"
  | "onboarding_required"
  | "not_found"
  | "invalid_request"
  | "username_taken"
  | "delete_failed"
  | "sign_in_not_closed";

/** Every non-2xx response. `error` is fit to show the person. */
export type ApiErrorBody = { error: string; code: ApiErrorCode };

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

export type CookbookRole = "OWNER" | "EDITOR" | "VIEWER";

/** Everything needed to draw a cookbook's cover. */
export type CoverDesign = {
  /** Index into the cover palette. */
  coverColor: number;
  coverStyle: "TITLED" | "PLAIN" | "PHOTO";
  coverImageUrl: string | null;
  coverTexture: "NONE" | "GINGHAM" | "GRID";
  coverTitleFont: "SERIF" | "SANS";
  coverTitleSize: "SMALL" | "MEDIUM" | "LARGE";
  coverTitlePosition: "TOP" | "CENTER" | "BOTTOM";
  /** Where the photo is centred, 0–1 across and down. */
  coverFocalX: number;
  coverFocalY: number;
  coverZoom: number;
};

// ---------------------------------------------------------------------------
// GET /api/v1/me · POST /api/v1/me/onboarding
// ---------------------------------------------------------------------------

export type Me = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  avatarUrl: string | null;
  /** False until they've picked a username — show onboarding first. */
  onboarded: boolean;
};

/** Blank names are fine; `username` is required. */
export type OnboardingRequest = {
  username: string;
  firstName?: string;
  lastName?: string;
};

// ---------------------------------------------------------------------------
// GET /api/v1/me/deletion · DELETE /api/v1/me
// ---------------------------------------------------------------------------

export type AccountDeletionPreview = {
  /**
   * Their recipes in cookbooks other people will keep using. When it's over
   * zero, ask whether to delete those or keep them, credited to "a former
   * member".
   */
  recipesElsewhere: number;
};

/** `recipes` defaults to "keep" — the right answer when nothing was asked. */
export type DeleteAccountRequest = { recipes?: "keep" | "delete" };

// ---------------------------------------------------------------------------
// GET /api/v1/cookbooks
// ---------------------------------------------------------------------------

export type CookbookSummary = {
  id: string;
  title: string;
  description: string | null;
  design: CoverDesign;
  role: CookbookRole;
  recipeCount: number;
  memberCount: number;
};

export type CookbookList = { cookbooks: CookbookSummary[] };

// ---------------------------------------------------------------------------
// GET /api/v1/cookbooks/:id
// ---------------------------------------------------------------------------

export type RecipeSummary = {
  id: string;
  title: string;
  description: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  coverImageUrl: string | null;
  authorName: string;
  ingredientCount: number;
  stepCount: number;
};

export type CookbookDetail = {
  id: string;
  title: string;
  description: string | null;
  design: CoverDesign;
  role: CookbookRole;
  canAddRecipes: boolean;
  canEditCookbook: boolean;
  recipes: RecipeSummary[];
};

// ---------------------------------------------------------------------------
// GET /api/v1/cookbooks/:id/recipes/:recipeId
// ---------------------------------------------------------------------------

export type RecipeDetail = {
  id: string;
  title: string;
  description: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  coverImageUrl: string | null;
  authorName: string;
  /** Whether this person may edit or delete it — its author, or the owner. */
  canModify: boolean;
  cookbook: { id: string; title: string };
  ingredients: {
    id: string;
    name: string;
    /** A number, so cooking mode can scale it. Null for "salt, to taste". */
    quantity: number | null;
    unit: string;
    note: string | null;
  }[];
  steps: { id: string; instruction: string }[];
};
