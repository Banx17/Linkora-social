"use client";

/**
 * Demo page for the Server Action flows added in issue #1738.
 *
 * Post creation, tipping and follow/unfollow all run through Server Actions
 * (`useActionState` + `useFormStatus`) instead of client-side fetches.
 */

import { useWallet } from "@/hooks/useWallet";
import { PostServerForm } from "@/components/forms/PostServerForm";
import { TipServerForm } from "@/components/forms/TipServerForm";
import { FollowServerButton } from "@/components/profile/FollowServerButton";

/** Testnet USDC-style token used as the tip asset in the demo. */
const DEMO_TOKEN = "C" + "A".repeat(55);

const DEMO_FOLLOWEE = "G" + "B".repeat(55);

export default function ServerActionsDemoPage() {
  const { address } = useWallet();

  return (
    <div className="min-h-screen bg-[var(--background)] p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header>
          <h1 className="mb-2 text-3xl font-bold text-[var(--text-primary)]">Server Actions</h1>
          <p className="text-[var(--text-muted)]">
            Post creation, tipping and follow/unfollow handled entirely on the server with React 19
            form actions.
          </p>
        </header>

        {!address && (
          <p role="status" className="text-sm text-[var(--text-muted)]">
            Connect your wallet to try the forms below.
          </p>
        )}

        <section className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4">
          <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">Create a post</h2>
          <PostServerForm author={address} />
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4">
          <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">Tip post #1</h2>
          <TipServerForm postId={1} tipper={address} token={DEMO_TOKEN} />
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4">
          <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">Follow</h2>
          <FollowServerButton follower={address} followee={DEMO_FOLLOWEE} isFollowing={false} />
        </section>
      </div>
    </div>
  );
}
