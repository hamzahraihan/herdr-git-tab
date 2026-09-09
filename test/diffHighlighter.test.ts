import { describe, expect, it } from "vitest";
import { highlightDiffLine } from "../src/diffHighlighter.js";

describe("highlightDiffLine", () => {
  it("highlights command prompt headers", () => {
    const spans = highlightDiffLine("$ git show 02e4088");
    expect(spans).toEqual([
      { text: "$ ", color: "magenta", bold: true },
      { text: "git show 02e4088", color: "cyan", bold: true },
    ]);
  });

  it("highlights commit hash headers", () => {
    const spans = highlightDiffLine("commit 02e4088f58058c63433577759a6026721ccdae98");
    expect(spans).toEqual([
      { text: "commit ", color: "yellow", bold: true },
      { text: "02e4088f58058c63433577759a6026721ccdae98", color: "yellow" },
    ]);
  });

  it("highlights author and date metadata", () => {
    const author = highlightDiffLine("Author: Ada Lovelace <ada@example.com>");
    expect(author).toEqual([
      { text: "Author: ", color: "cyan" },
      { text: "Ada Lovelace <ada@example.com>", color: "white" },
    ]);

    const date = highlightDiffLine("Date:   Tue Sep 8 14:03:26 2026 +0700");
    expect(date).toEqual([
      { text: "Date: ", color: "gray" },
      { text: "Tue Sep 8 14:03:26 2026 +0700", color: "gray", dimColor: true },
    ]);
  });

  it("highlights merge headers", () => {
    const merge = highlightDiffLine("Merge: 1234567 89abcde");
    expect(merge).toEqual([
      { text: "Merge: ", color: "cyan" },
      { text: "1234567 89abcde", color: "gray" },
    ]);
  });

  it("highlights diff file headers and index", () => {
    expect(highlightDiffLine("diff --git a/foo.ts b/foo.ts")).toEqual([
      { text: "diff --git a/foo.ts b/foo.ts", color: "white", bold: true },
    ]);
    expect(highlightDiffLine("index abc..def 100644")).toEqual([
      { text: "index abc..def 100644", color: "gray", dimColor: true },
    ]);
    expect(highlightDiffLine("--- a/foo.ts")).toEqual([
      { text: "--- a/foo.ts", color: "red", bold: true },
    ]);
    expect(highlightDiffLine("+++ b/foo.ts")).toEqual([
      { text: "+++ b/foo.ts", color: "green", bold: true },
    ]);
    expect(highlightDiffLine("---")).toEqual([
      { text: "---", color: "gray", dimColor: true },
    ]);
  });

  it("highlights hunk headers and context", () => {
    const spans = highlightDiffLine("@@ -10,5 +10,6 @@ function test()");
    expect(spans).toEqual([
      { text: "@@ -10,5 +10,6 @@", color: "cyan", bold: true },
      { text: " function test()", color: "gray", dimColor: true },
    ]);
  });

  it("highlights additions in green and deletions in red", () => {
    expect(highlightDiffLine("+const answer = 42;")).toEqual([
      { text: "+const answer = 42;", color: "green" },
    ]);
    expect(highlightDiffLine("-const answer = 41;")).toEqual([
      { text: "-const answer = 41;", color: "red" },
    ]);
    expect(highlightDiffLine("+")).toEqual([{ text: "+", color: "green" }]);
    expect(highlightDiffLine("-")).toEqual([{ text: "-", color: "red" }]);
  });

  it("highlights stat rows with colored plus and minus indicators", () => {
    const spans = highlightDiffLine(" src/app.tsx | 10 ++++----");
    expect(spans).toEqual([
      { text: " src/app.tsx", color: "white" },
      { text: " | ", color: "gray", dimColor: true },
      { text: "10 ", color: "cyan" },
      { text: "++++", color: "green" },
      { text: "----", color: "red" },
    ]);

    const bin = highlightDiffLine(" logo.png | Bin 1024 -> 2048 bytes");
    expect(bin).toEqual([
      { text: " logo.png", color: "white" },
      { text: " | ", color: "gray", dimColor: true },
      { text: "Bin 1024 -> 2048 bytes", color: "yellow" },
    ]);
  });

  it("highlights stat summary rows", () => {
    const spans = highlightDiffLine(" 2 files changed, 5 insertions(+), 1 deletion(-)");
    expect(spans).toEqual([
      { text: " 2 files changed", color: "white", bold: true },
      { text: ", 5 insertions(+)", color: "green" },
      { text: ", 1 deletion(-)", color: "red" },
    ]);
  });

  it("highlights file mode and rename notices", () => {
    expect(highlightDiffLine("new file mode 100644")).toEqual([
      { text: "new file mode 100644", color: "yellow" },
    ]);
    expect(highlightDiffLine("Binary files a/img.png and b/img.png differ")).toEqual([
      { text: "Binary files a/img.png and b/img.png differ", color: "yellow" },
    ]);
  });

  it("highlights git log oneline output", () => {
    const spans = highlightDiffLine("02e4088 Update README");
    expect(spans).toEqual([
      { text: "02e4088 ", color: "yellow" },
      { text: "Update README", color: "white" },
    ]);
  });

  it("highlights commit body text and notices", () => {
    expect(highlightDiffLine("    Some message")).toEqual([
      { text: "    Some message", color: "white" },
    ]);
    expect(highlightDiffLine("(untracked foo: no diff)")).toEqual([
      { text: "(untracked foo: no diff)", color: "gray", dimColor: true },
    ]);
    expect(highlightDiffLine("")).toEqual([{ text: " " }]);
    expect(highlightDiffLine(" normal context")).toEqual([
      { text: " normal context" },
    ]);
  });
});
