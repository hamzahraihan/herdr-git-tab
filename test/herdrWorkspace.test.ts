import { describe, expect, it } from "vitest";
import { normalizeHerdrPath, pickWorkspaceCwd } from "../src/herdrWorkspace.js";

describe("normalizeHerdrPath", () => {
  it("strips the Windows extended-path prefix", () => {
    expect(normalizeHerdrPath("\\\\?\\C:\\javascript-projects\\inkstream")).toBe(
      "C:\\javascript-projects\\inkstream",
    );
  });

  it("trims whitespace and trailing slashes but keeps roots", () => {
    expect(normalizeHerdrPath("  C:\\repo\\ ")).toBe("C:\\repo");
    expect(normalizeHerdrPath("C:\\")).toBe("C:\\");
    expect(normalizeHerdrPath("/")).toBe("/");
  });
});

describe("pickWorkspaceCwd", () => {
  it("prefers the focused sibling pane cwd", () => {
    expect(
      pickWorkspaceCwd(
        [
          { pane_id: "w1:p1", workspace_id: "w1", cwd: "C:\\other" },
          { pane_id: "w1:p2", workspace_id: "w1", cwd: "C:\\focused", focused: true },
        ],
        "w1",
        "w1:self",
      ),
    ).toBe("C:\\focused");
  });

  it("excludes the tab's own pane so it never binds to the plugin dir", () => {
    expect(
      pickWorkspaceCwd(
        [
          { pane_id: "w1:self", workspace_id: "w1", cwd: "C:\\plugin", focused: true },
          { pane_id: "w1:p1", workspace_id: "w1", cwd: "C:\\real-repo" },
        ],
        "w1",
        "w1:self",
      ),
    ).toBe("C:\\real-repo");
  });

  it("ignores panes from other workspaces", () => {
    expect(
      pickWorkspaceCwd(
        [
          { pane_id: "w2:p1", workspace_id: "w2", cwd: "C:\\elsewhere", focused: true },
          { pane_id: "w1:p1", workspace_id: "w1", cwd: "C:\\mine" },
        ],
        "w1",
        "w1:self",
      ),
    ).toBe("C:\\mine");
  });

  it("returns null when only the tab itself or no cwd exists", () => {
    expect(
      pickWorkspaceCwd([{ pane_id: "w1:self", workspace_id: "w1", cwd: "C:\\x" }], "w1", "w1:self"),
    ).toBeNull();
    expect(pickWorkspaceCwd([], "w1", "w1:self")).toBeNull();
    expect(pickWorkspaceCwd([{ pane_id: "w1:p1", workspace_id: "w1" }], "w1", "w1:self")).toBeNull();
  });

  it("returns null without a workspace id (plain terminal)", () => {
    expect(
      pickWorkspaceCwd([{ pane_id: "w1:p1", workspace_id: "w1", cwd: "C:\\x" }], undefined, undefined),
    ).toBeNull();
  });
});
