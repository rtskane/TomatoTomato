import type { CookbookSummary } from "@/server/services/cookbook.service";

/**
 * "3 recipes · 2 members" — pluralized, and the role only when it's worth
 * saying (every cookbook has an owner; being one isn't news on your own shelf).
 *
 * Shared by both dashboard views so the two can't drift into describing the
 * same cookbook differently.
 */
export default function CookbookMeta({
  cookbook,
  className = "",
}: {
  cookbook: CookbookSummary;
  className?: string;
}) {
  const parts = [
    `${cookbook.recipeCount} ${cookbook.recipeCount === 1 ? "recipe" : "recipes"}`,
    `${cookbook.memberCount} ${cookbook.memberCount === 1 ? "member" : "members"}`,
  ];
  if (cookbook.role !== "OWNER") parts.push(cookbook.role.toLowerCase());

  return (
    <p className={`text-caption-1 text-foreground-tertiary ${className}`}>
      {parts.join(" · ")}
    </p>
  );
}
