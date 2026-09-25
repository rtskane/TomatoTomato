import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma boundary: these tests pin *how* the repository asks — the
// lock, then the count, then the write, all in one transaction.
const { aiImport, $executeRaw, $transaction } = vi.hoisted(() => ({
  aiImport: { count: vi.fn(), create: vi.fn() },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction } }));

import { aiImportRepository } from "./ai-import.repository";

const SINCE = new Date("2026-09-24T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  $transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ aiImport, $executeRaw }),
  );
});

describe("aiImportRepository.claim", () => {
  it("records an import when the user is under the limit", async () => {
    aiImport.count.mockResolvedValue(19);

    expect(await aiImportRepository.claim("u1", 20, SINCE)).toBe(true);
    expect(aiImport.count).toHaveBeenCalledWith({
      where: { userId: "u1", createdAt: { gt: SINCE } },
    });
    expect(aiImport.create).toHaveBeenCalledWith({ data: { userId: "u1" } });
  });

  it("refuses, and records nothing, once the user is at the limit", async () => {
    aiImport.count.mockResolvedValue(20);

    expect(await aiImportRepository.claim("u1", 20, SINCE)).toBe(false);
    expect(aiImport.create).not.toHaveBeenCalled();
  });

  it("takes a lock on this user before counting, so a burst can't all squeeze in", async () => {
    aiImport.count.mockResolvedValue(0);

    await aiImportRepository.claim("u1", 20, SINCE);

    const [sql, key] = $executeRaw.mock.calls[0];
    expect(sql.join("?")).toMatch(/pg_advisory_xact_lock/);
    expect(key).toBe("ai-import:u1");
    expect($executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      aiImport.count.mock.invocationCallOrder[0],
    );
  });
});
