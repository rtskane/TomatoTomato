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
  /**
   * What has been placed on the cover, bottom of the stack first. Draw these
   * over the cloth (or photo), in order.
   *
   * When one of them is the title (`role: "title"`), the cover's name is drawn
   * *there* and the title plate is not drawn at all — even though `coverStyle`
   * is still TITLED. A client that doesn't draw elements yet can ignore this
   * field and keep drawing the plate: it will show the right name on the right
   * cloth, just not where its owner put it.
   */
  coverElements: CoverElement[];
};

/** A colour from the cover palette (by index) or white. */
export type CoverElementColor =
  | "cover-1"
  | "cover-2"
  | "cover-3"
  | "cover-4"
  | "cover-5"
  | "cover-6"
  | "cover-7"
  | "cover-8"
  | "white";

/**
 * Where an element sits. `x`/`y` are its *centre* as fractions of the cover's
 * width and height; `w` is its width as a fraction of the cover's width;
 * `rotation` is degrees clockwise about the centre.
 */
type PlacedOnCover = { id: string; x: number; y: number; w: number; rotation: number };

export type CoverElement =
  | (PlacedOnCover & {
      type: "text";
      /** Present on the one element that shows the cookbook's title; ignore `text` then. */
      role?: "title";
      text: string;
      font: "SERIF" | "SANS" | "MONO";
      /**
       * Type size as a percentage of the cover's width. The title is drawn
       * smaller than this for a long name — see `titleScale` in
       * lib/cover-elements.ts.
       */
      size: number;
      color: CoverElementColor;
      align: "left" | "center" | "right";
      bold: boolean;
      italic: boolean;
    })
  | (PlacedOnCover & {
      type: "photo";
      url: string;
      /** Height as a fraction of the cover's height. */
      h: number;
      mask: "rect" | "rounded" | "circle";
    })
  | (PlacedOnCover & {
      type: "shape";
      shape: "rect" | "circle" | "triangle" | "line" | "frame";
      h: number;
      color: CoverElementColor;
      /** Outline rather than fill, for rect and circle. A frame is always a thin outline. */
      outline: boolean;
    })
  | (PlacedOnCover & {
      type: "sticker";
      /** Square: height follows from `w`. */
      sticker: "tomato" | "lemon" | "chili" | "herb" | "whisk" | "spoon" | "heart" | "star";
    });

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
