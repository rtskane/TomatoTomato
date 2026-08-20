import type { Metadata } from "next";

// A live rendering of every token in theme.css, so the palette can be judged in
// a browser rather than by reading hexes. It is built entirely out of the
// token utilities, which makes it double as a smoke test: if a token stops
// compiling, this page shows it immediately.
export const metadata: Metadata = {
  title: "Theme — Tomato Tomato",
  robots: { index: false, follow: false },
};

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="text-title-3">{title}</h2>
      {note ? (
        <p className="mt-1 max-w-2xl text-footnote text-foreground-tertiary">
          {note}
        </p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div>
      <div
        className={`h-16 rounded-md border border-border-faint ${className}`}
      />
      <p className="mt-2 text-caption-1 text-foreground-secondary">{name}</p>
    </div>
  );
}

function SwatchGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {children}
    </div>
  );
}

const BOOK_COVERS = [
  ["bg-book-cover-1", "text-book-ink-1", "1 · Worn Ruby · 13.1:1"],
  ["bg-book-cover-2", "text-book-ink-2", "2 · Garnet Crystal · 4.3:1"],
  ["bg-book-cover-3", "text-book-ink-3", "3 · Dusty Bronze · 5.1:1"],
  ["bg-book-cover-4", "text-book-ink-4", "4 · Alpine Amber · 7.9:1"],
  ["bg-book-cover-5", "text-book-ink-5", "5 · Forest Ochre · 5.9:1"],
];

const TYPE_SCALE = [
  ["text-large-title", "LargeTitle · 34/40 · Black"],
  ["text-title-2", "Title2 · 32/32 · Black"],
  ["text-title-1", "Title1 · 28/32 · Black"],
  ["text-title-3", "Title3 · 20/24 · Bold"],
  ["text-headline font-bold", "Headline · 17/24 · Bold"],
  ["text-headline font-semibold", "Headline · 17/24 · Semibold"],
  ["text-body", "Body · 16/24 · Regular"],
  ["text-body font-bold", "Body · 16/24 · Bold"],
  ["text-callout", "Callout · 15/20 · Regular"],
  ["text-callout font-semibold", "Callout · 15/20 · Semibold"],
  ["text-subheadline", "Subheadline · 14/20 · Regular"],
  ["text-subheadline font-medium", "Subheadline · 14/20 · Medium"],
  ["text-subheadline font-bold", "Subheadline · 14/20 · Bold"],
  ["text-footnote", "Footnote · 13/16 · Regular"],
  ["text-footnote font-bold", "Footnote · 13/16 · Bold"],
  ["text-caption-1", "Caption1 · 12/16 · Regular"],
  ["text-caption-1 font-medium", "Caption1 · 12/16 · Medium"],
  ["text-caption-1 font-semibold", "Caption1 · 12/16 · Semibold"],
  ["text-caption-2", "Caption2 · 11/14 · Regular"],
  ["text-eyebrow", "Eyebrow · 11/16 · Semibold"],
  ["text-date-num", "DateNum · 22/28 · Black"],
  ["text-date-label", "DateLabel · 11/16 · Bold"],
  ["text-legal", "Legal · 11/16 · Regular"],
] as const;

const SPACING = [1, 2, 3, 4, 5, 6, 8, 10, 12] as const;

const RADII = [
  ["rounded-sm", "sm · 8"],
  ["rounded-md", "md · 12"],
  ["rounded-lg", "lg · 16"],
  ["rounded-xl", "xl · 20"],
  ["rounded-full", "full · 999"],
] as const;

export default function ThemePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <p className="text-eyebrow text-foreground-tertiary">DESIGN TOKENS</p>
      <h1 className="mt-2 text-large-title">Theme</h1>
      <p className="mt-3 max-w-2xl text-body text-foreground-secondary">
        Every token defined in{" "}
        <code className="font-mono text-callout">src/app/theme.css</code>,
        rendered through its own utility class. Swap the primitives at the top
        of that file and this page changes with it.
      </p>

      <Section
        title="Accent"
        note="Garnet Crystal and the tints extrapolated around it. Only the 500 step is a supplied colour."
      >
        <SwatchGrid>
          <Swatch name="accent (500)" className="bg-accent" />
          <Swatch name="accent-hover (600)" className="bg-accent-hover" />
          <Swatch name="accent-subtle (200)" className="bg-accent-subtle" />
          <Swatch name="background-accent (wash)" className="bg-background-accent" />
          <Swatch name="on-accent" className="bg-on-accent" />
        </SwatchGrid>
      </Section>

      <Section
        title="Surfaces"
        note="Background roles. The app is light-only. background-accent is Alpine Amber's wash, not a garnet tint."
      >
        <SwatchGrid>
          <Swatch name="background" className="bg-background" />
          <Swatch name="background-secondary" className="bg-background-secondary" />
          <Swatch name="background-control" className="bg-background-control" />
          <Swatch name="background-inverse" className="bg-background-inverse" />
          <Swatch name="background-accent" className="bg-background-accent" />
        </SwatchGrid>
      </Section>

      <Section title="Text">
        <div className="rounded-lg border border-border p-6">
          <p className="text-body text-foreground">foreground — primary copy</p>
          <p className="mt-2 text-body text-foreground-secondary">
            foreground-secondary — supporting copy
          </p>
          <p className="mt-2 text-body text-foreground-tertiary">
            foreground-tertiary — metadata
          </p>
          <p className="mt-2 text-body text-foreground-muted">
            foreground-muted — placeholders
          </p>
          <p className="mt-2 text-body text-foreground-disabled">
            foreground-disabled — inactive
          </p>
          <p className="mt-4 rounded-md bg-background-inverse p-3 text-body text-foreground-inverse">
            foreground-inverse — on a dark surface
          </p>
          <p className="mt-2 rounded-md bg-accent p-3 text-body text-on-accent">
            on-accent — on the accent colour
          </p>
        </div>
      </Section>

      <Section
        title="Borders"
        note="Shown as 2px so the steps are distinguishable; most are 1px in use."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["border-border-faint", "faint"],
            ["border-border", "default"],
            ["border-border-strong", "strong"],
            ["border-border-input", "input"],
            ["border-border-input-strong", "input-strong"],
            ["border-border-error", "error"],
          ].map(([cls, label]) => (
            <div key={label}>
              <div className={`h-16 rounded-md border-2 ${cls}`} />
              <p className="mt-2 text-caption-1 text-foreground-secondary">
                {label}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Status"
        note="Error is the darkened accent — this palette's only alarm colour is a red. Info is a stock blue: no blue was supplied."
      >
        <SwatchGrid>
          <Swatch name="success" className="bg-success" />
          <Swatch name="error" className="bg-error" />
          <Swatch name="warning" className="bg-warning" />
          <Swatch name="info" className="bg-info" />
        </SwatchGrid>
      </Section>

      <Section
        title="Book covers"
        note="The dashboard shelf. Each cover ships with the one ink that is legible on it — the swatch is set in that ink, so a bad pairing shows up here rather than on the shelf."
      >
        <SwatchGrid>
          {BOOK_COVERS.map(([face, ink, label]) => (
            <div key={face}>
              <div
                className={`flex h-16 items-center justify-center rounded-md border border-border-faint font-serif text-callout ${face} ${ink}`}
              >
                Cookbook
              </div>
              <p className="mt-2 text-caption-1 text-foreground-secondary">
                {label}
              </p>
            </div>
          ))}
        </SwatchGrid>
      </Section>

      <Section
        title="Typography"
        note="Steps carry their Figma size and line-height. Where a Figma style ships in several weights, compose the step with a font-weight utility."
      >
        <div className="divide-y divide-border-faint">
          {TYPE_SCALE.map(([cls, label]) => (
            <div
              key={label}
              className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <span className="w-64 shrink-0 text-caption-1 text-foreground-tertiary">
                {label}
              </span>
              <span className={cls}>Cook together, one recipe at a time.</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Spacing"
        note="Not redefined — Figma's 8pt scale is already Tailwind's stock scale, so p-4 is Figma's space/4."
      >
        <div className="space-y-2">
          {SPACING.map((step) => (
            <div key={step} className="flex items-center gap-4">
              <span className="w-32 text-caption-1 text-foreground-tertiary">
                space/{step} · {step * 4}px
              </span>
              <div
                className="h-4 rounded-sm bg-accent"
                style={{ width: `${step * 8}px` }}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Radius"
        note="Larger than Tailwind's stock scale — rounded-md is 12px here, not 6px."
      >
        <div className="flex flex-wrap gap-6">
          {RADII.map(([cls, label]) => (
            <div key={label}>
              <div
                className={`h-24 w-24 border border-border-strong bg-background-secondary ${cls}`}
              />
              <p className="mt-2 text-caption-1 text-foreground-secondary">
                {label}
              </p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
