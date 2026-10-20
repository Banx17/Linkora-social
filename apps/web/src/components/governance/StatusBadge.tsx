import type { GovernanceStatus } from "@/lib/governance";

const STYLES: Record<GovernanceStatus, string> = {
  Active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Passed: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  Failed: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  Executed: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  Vetoed: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function StatusBadge({ status }: { status: GovernanceStatus }) {
  return (
    <span
      data-testid={`status-${status.toLowerCase()}`}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
