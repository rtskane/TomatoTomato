import { SETUP_STEPS, SETUP_STEP_COUNT, stepNumber, type SetupStep } from "@/lib/setup-steps";

/**
 * "Step 2 of 3", with the three named.
 *
 * Presentational and deliberately not a set of links: the steps after the
 * current one are reachable by finishing or skipping this one, and offering
 * them as navigation would invite jumping into the invite step of a cookbook
 * whose name hasn't been settled.
 *
 * The visible pips are `aria-hidden` and the real statement is the sentence
 * beside them — a screen reader gets "Step 2 of 3: Cover" rather than three
 * unexplained dots.
 */
export default function SetupProgress({ current }: { current: SetupStep }) {
  const index = stepNumber(current);

  return (
    <div className="flex items-center gap-3">
      <p className="text-caption-1 font-medium text-foreground-secondary">
        Step {index} of {SETUP_STEP_COUNT}
        <span className="sr-only">
          : {SETUP_STEPS[index - 1]?.label ?? ""}
        </span>
      </p>

      <ol aria-hidden className="flex items-center gap-1.5">
        {SETUP_STEPS.map((step, i) => (
          <li
            key={step.key}
            className={`h-1 rounded-full transition-colors ${
              i + 1 === index
                ? "w-6 bg-accent"
                : i + 1 < index
                  ? "w-3 bg-accent/40"
                  : "w-3 bg-border"
            }`}
          />
        ))}
      </ol>
    </div>
  );
}
