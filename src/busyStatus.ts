export type BusyOp =
  | { kind: "refresh" }
  | { kind: "checkout-branch"; name: string }
  | { kind: "checkout-pr"; number: number }
  | { kind: "diff-branch"; name: string }
  | { kind: "diff-file"; path: string }
  | { kind: "commit"; short: string }
  | { kind: "pr"; number: number }
  | { kind: "issue"; number: number }
  | { kind: "approve"; number: number }
  | { kind: "create-pr" };

export function busyLabel(op: BusyOp): string {
  switch (op.kind) {
    case "refresh":
      return "Refreshing…";
    case "checkout-branch":
      return `Checking out ${op.name}…`;
    case "checkout-pr":
      return `Checking out PR #${op.number}…`;
    case "diff-branch":
      return `Loading diff ${op.name}…`;
    case "diff-file":
      return `Loading diff ${op.path}…`;
    case "commit":
      return `Loading commit ${op.short}…`;
    case "pr":
      return `Loading PR #${op.number}…`;
    case "issue":
      return `Loading issue #${op.number}…`;
    case "approve":
      return `Approving PR #${op.number}…`;
    case "create-pr":
      return "Creating PR…";
  }
}
