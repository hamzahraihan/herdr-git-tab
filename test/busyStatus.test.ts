import { describe, expect, it } from "vitest";
import { busyLabel } from "../src/busyStatus.js";

describe("busyLabel", () => {
  it("labels every manual op", () => {
    expect(busyLabel({ kind: "refresh" })).toBe("Refreshing…");
    expect(busyLabel({ kind: "checkout-branch", name: "main" })).toBe("Checking out main…");
    expect(busyLabel({ kind: "checkout-pr", number: 12 })).toBe("Checking out PR #12…");
    expect(busyLabel({ kind: "diff-branch", name: "feat" })).toBe("Loading diff feat…");
    expect(busyLabel({ kind: "diff-file", path: "src/a.ts" })).toBe("Loading diff src/a.ts…");
    expect(busyLabel({ kind: "commit", short: "9f2c3a1" })).toBe("Loading commit 9f2c3a1…");
    expect(busyLabel({ kind: "pr", number: 7 })).toBe("Loading PR #7…");
    expect(busyLabel({ kind: "issue", number: 9 })).toBe("Loading issue #9…");
    expect(busyLabel({ kind: "approve", number: 7 })).toBe("Approving PR #7…");
    expect(busyLabel({ kind: "create-pr" })).toBe("Creating PR…");
  });
});
