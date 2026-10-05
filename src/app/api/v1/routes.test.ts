import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  ensureUser,
  listUserCookbooks,
  getCookbookDetail,
  getRecipeDetail,
  onboardUser,
  findByClerkId,
  getAccountDeletionPreview,
  deleteOwnAccount,
} = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  listUserCookbooks: vi.fn(),
  getCookbookDetail: vi.fn(),
  getRecipeDetail: vi.fn(),
  onboardUser: vi.fn(),
  findByClerkId: vi.fn(),
  getAccountDeletionPreview: vi.fn(),
  deleteOwnAccount: vi.fn(),
}));
vi.mock("@/lib/user", () => ({ ensureUser }));
vi.mock("@/lib/account", () => ({ deleteOwnAccount }));
vi.mock("@/server/services/onboarding.service", () => ({ onboardUser }));
vi.mock("@/server/repositories/user.repository", () => ({
  userRepository: { findByClerkId },
}));
vi.mock("@/server/services/account.service", () => ({
  getAccountDeletionPreview,
}));
vi.mock("@/server/services/cookbook.service", () => ({
  listUserCookbooks,
  getCookbookDetail,
}));
vi.mock("@/server/services/recipe-detail.service", () => ({ getRecipeDetail }));

import { GET as getMe, DELETE as deleteMe } from "./me/route";
import { POST as onboard } from "./me/onboarding/route";
import { GET as getDeletionPreview } from "./me/deletion/route";
import { GET as getCookbooks } from "./cookbooks/route";
import { GET as getCookbook } from "./cookbooks/[id]/route";
import { GET as getRecipe } from "./cookbooks/[id]/recipes/[recipeId]/route";

const request = (path: string) => new Request(`http://localhost${path}`);
const send = (method: string, path: string, body?: string) =>
  new Request(`http://localhost${path}`, { method, body });
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

const chef = {
  id: "u1",
  clerkId: "user_abc",
  username: "chef",
  firstName: "Ada",
  lastName: null,
  email: "ada@example.com",
  avatarUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  ensureUser.mockResolvedValue(chef);
});

/** Each endpoint that needs an onboarded user, called for cookbook c1 / recipe r1. */
const gated = [
  ["GET /cookbooks", () => getCookbooks()],
  [
    "GET /cookbooks/:id",
    () => getCookbook(request("/api/v1/cookbooks/c1"), params({ id: "c1" })),
  ],
  [
    "GET /cookbooks/:id/recipes/:recipeId",
    () =>
      getRecipe(
        request("/api/v1/cookbooks/c1/recipes/r1"),
        params({ id: "c1", recipeId: "r1" }),
      ),
  ],
] as const;

describe.each(gated)("%s", (_name, call) => {
  it("answers 401 when no one is signed in, without reading anything", async () => {
    ensureUser.mockResolvedValue(null);

    const response = await call();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Not signed in.",
      code: "unauthenticated",
    });
    expect(listUserCookbooks).not.toHaveBeenCalled();
    expect(getCookbookDetail).not.toHaveBeenCalled();
    expect(getRecipeDetail).not.toHaveBeenCalled();
  });

  it("answers 403 onboarding_required before onboarding is done", async () => {
    ensureUser.mockResolvedValue({ ...chef, username: null });

    const response = await call();

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("onboarding_required");
  });
});

describe("GET /api/v1/me", () => {
  it("describes the signed-in user, without their Clerk id", async () => {
    const response = await getMe();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "u1",
      username: "chef",
      firstName: "Ada",
      lastName: null,
      email: "ada@example.com",
      avatarUrl: null,
      onboarded: true,
    });
  });

  it("answers someone mid-onboarding, so the app knows to show onboarding", async () => {
    ensureUser.mockResolvedValue({ ...chef, username: null });

    const response = await getMe();

    expect(response.status).toBe(200);
    expect((await response.json()).onboarded).toBe(false);
  });

  it("answers 401 when no one is signed in", async () => {
    ensureUser.mockResolvedValue(null);
    expect((await getMe()).status).toBe(401);
  });
});

describe("GET /api/v1/cookbooks", () => {
  it("lists the user's cookbooks", async () => {
    listUserCookbooks.mockResolvedValue([{ id: "c1", title: "Family" }]);

    const response = await getCookbooks();

    expect(listUserCookbooks).toHaveBeenCalledWith("u1");
    expect(await response.json()).toEqual({
      cookbooks: [{ id: "c1", title: "Family" }],
    });
  });
});

describe("GET /api/v1/cookbooks/:id", () => {
  it("returns the cookbook, looked up for this user", async () => {
    getCookbookDetail.mockResolvedValue({ id: "c1", recipes: [] });

    const response = await getCookbook(
      request("/api/v1/cookbooks/c1"),
      params({ id: "c1" }),
    );

    expect(getCookbookDetail).toHaveBeenCalledWith("u1", "c1");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "c1", recipes: [] });
  });

  it("answers 404 when the user can't see it", async () => {
    getCookbookDetail.mockResolvedValue(null);

    const response = await getCookbook(
      request("/api/v1/cookbooks/c1"),
      params({ id: "c1" }),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("not_found");
  });
});

describe("GET /api/v1/cookbooks/:id/recipes/:recipeId", () => {
  it("returns the recipe, looked up for this user in this cookbook", async () => {
    getRecipeDetail.mockResolvedValue({ id: "r1", title: "Soup" });

    const response = await getRecipe(
      request("/api/v1/cookbooks/c1/recipes/r1"),
      params({ id: "c1", recipeId: "r1" }),
    );

    expect(getRecipeDetail).toHaveBeenCalledWith("u1", "c1", "r1");
    expect(await response.json()).toEqual({ id: "r1", title: "Soup" });
  });

  it("answers 404 when the user can't see it", async () => {
    getRecipeDetail.mockResolvedValue(null);

    const response = await getRecipe(
      request("/api/v1/cookbooks/c1/recipes/r1"),
      params({ id: "c1", recipeId: "r1" }),
    );

    expect(response.status).toBe(404);
  });
});

describe("POST /api/v1/me/onboarding", () => {
  const post = (body?: string) => onboard(send("POST", "/api/v1/me/onboarding", body));

  beforeEach(() => {
    ensureUser.mockResolvedValue({ ...chef, username: null, firstName: null });
    onboardUser.mockResolvedValue({ ok: true, value: { username: "chef" } });
    findByClerkId.mockResolvedValue(chef);
  });

  it("sets the profile for the signed-in user and answers with the new Me", async () => {
    const response = await post(
      JSON.stringify({ username: "chef", firstName: "Ada" }),
    );

    expect(onboardUser).toHaveBeenCalledWith("user_abc", {
      username: "chef",
      firstName: "Ada",
      lastName: "",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      username: "chef",
      firstName: "Ada",
      onboarded: true,
    });
  });

  it("answers 409 username_taken when someone has it", async () => {
    onboardUser.mockResolvedValue({
      ok: false,
      error: { kind: "username_taken", message: "That username is already taken." },
    });

    const response = await post(JSON.stringify({ username: "chef" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "That username is already taken.",
      code: "username_taken",
    });
  });

  it("answers 400 with the validation message", async () => {
    onboardUser.mockResolvedValue({
      ok: false,
      error: { kind: "validation", message: "Usernames are 3 to 20 characters." },
    });

    const response = await post(JSON.stringify({ username: "x" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Usernames are 3 to 20 characters.");
  });

  it.each(["not json", "[1]", '"chef"'])(
    "answers 400 for a body that isn't a JSON object: %s",
    async (body) => {
      const response = await post(body);

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("invalid_request");
      expect(onboardUser).not.toHaveBeenCalled();
    },
  );

  it("treats fields that aren't strings as blank", async () => {
    await post(JSON.stringify({ username: 42, firstName: null }));

    expect(onboardUser).toHaveBeenCalledWith("user_abc", {
      username: "",
      firstName: "",
      lastName: "",
    });
  });

  it("answers 401 when no one is signed in", async () => {
    ensureUser.mockResolvedValue(null);

    expect((await post(JSON.stringify({ username: "chef" }))).status).toBe(401);
    expect(onboardUser).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/me/deletion", () => {
  it("previews the signed-in user's own account", async () => {
    getAccountDeletionPreview.mockResolvedValue({ recipesElsewhere: 3 });

    const response = await getDeletionPreview();

    expect(getAccountDeletionPreview).toHaveBeenCalledWith("u1");
    expect(await response.json()).toEqual({ recipesElsewhere: 3 });
  });

  it("answers 401 when no one is signed in", async () => {
    ensureUser.mockResolvedValue(null);
    expect((await getDeletionPreview()).status).toBe(401);
  });
});

describe("DELETE /api/v1/me", () => {
  const del = (body?: string) => deleteMe(send("DELETE", "/api/v1/me", body));

  beforeEach(() => {
    deleteOwnAccount.mockResolvedValue({ ok: true });
  });

  it("deletes the signed-in user's account with their choice, answering 204", async () => {
    const response = await del(JSON.stringify({ recipes: "delete" }));

    expect(deleteOwnAccount).toHaveBeenCalledWith(chef, { keepRecipes: false });
    expect(response.status).toBe(204);
  });

  it("keeps recipes when no body is sent", async () => {
    await del();
    expect(deleteOwnAccount).toHaveBeenCalledWith(chef, { keepRecipes: true });
  });

  it("works before onboarding is finished", async () => {
    ensureUser.mockResolvedValue({ ...chef, username: null });

    expect((await del()).status).toBe(204);
  });

  it.each([JSON.stringify({ recipes: "maybe" }), "not json"])(
    "answers 400 and deletes nothing for %s",
    async (body) => {
      const response = await del(body);

      expect(response.status).toBe(400);
      expect(deleteOwnAccount).not.toHaveBeenCalled();
    },
  );

  it("answers 500 delete_failed when nothing was deleted", async () => {
    deleteOwnAccount.mockResolvedValue({ ok: false, failed: "data" });

    const response = await del();

    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe("delete_failed");
  });

  it("answers 502 sign_in_not_closed when only the Clerk delete failed", async () => {
    deleteOwnAccount.mockResolvedValue({ ok: false, failed: "sign-in" });

    const response = await del();

    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("sign_in_not_closed");
  });

  it("answers 401 when no one is signed in", async () => {
    ensureUser.mockResolvedValue(null);

    expect((await del()).status).toBe(401);
    expect(deleteOwnAccount).not.toHaveBeenCalled();
  });
});
