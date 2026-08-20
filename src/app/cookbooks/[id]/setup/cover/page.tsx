import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/user";
import { getCookbookDetail } from "@/server/services/cookbook.service";
import SetupProgress from "@/components/setup-progress";
import { setupPath } from "@/lib/setup-steps";
import { saveSetupCoverAction } from "../actions";
import SetupCoverForm from "./setup-cover-form";

// Container: owns auth + data. Step two of three — the cookbook already
// exists, so this is an edit, which is exactly why it can be skipped and come
// back to later.
export default async function SetupCoverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireOnboardedUser();
  const cookbook = await getCookbookDetail(user.id, id);

  // 404 rather than 403 for a non-member: whether a cookbook exists is itself
  // information they shouldn't get. Someone who can see it but can't edit it
  // has no business designing its cover either.
  if (!cookbook || !cookbook.canEditCookbook) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <SetupProgress current="cover" />

      <h1 className="mt-4 text-title-1">Design the cover</h1>
      <p className="mt-2 text-subheadline text-foreground-secondary">
        Pick the cloth, set the title, add a photo — or leave it as it is and
        change it whenever you like.
      </p>

      <div className="mt-8">
        <SetupCoverForm
          title={cookbook.title}
          design={cookbook.design}
          action={saveSetupCoverAction.bind(
            null,
            cookbook.id,
            cookbook.title,
            cookbook.description ?? "",
          )}
          skipHref={setupPath(cookbook.id, "invite")}
        />
      </div>

      <p className="mt-8 text-caption-1 text-foreground-tertiary">
        Changed your mind later? It&rsquo;s all in{" "}
        <Link
          href={`/cookbooks/${cookbook.id}`}
          className="underline hover:text-foreground-secondary"
        >
          the cookbook&rsquo;s settings
        </Link>
        .
      </p>
    </div>
  );
}
