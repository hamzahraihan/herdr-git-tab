/** Color highlighter for git diffs, logs, and commit details. */

export type DiffSpan = {
  text: string;
  color?: string;
  bold?: boolean;
  dimColor?: boolean;
  backgroundColor?: string;
};

/** Split a line of diff or commit output into styled spans for terminal rendering. */
export function highlightDiffLine(line: string): DiffSpan[] {
  if (!line || line.trim().length === 0) {
    return [{ text: line || " " }];
  }

  // Command prompt: $ git ...
  if (line.startsWith("$ ")) {
    return [
      { text: "$ ", color: "magenta", bold: true },
      { text: line.slice(2), color: "cyan", bold: true },
    ];
  }

  // Commit hash header: commit 02e4088...
  if (/^commit [0-9a-f]{7,40}/i.test(line)) {
    const spaceIdx = line.indexOf(" ");
    return [
      { text: line.slice(0, spaceIdx + 1), color: "yellow", bold: true },
      { text: line.slice(spaceIdx + 1), color: "yellow" },
    ];
  }

  // Author header: Author: Name <email>
  if (line.startsWith("Author: ")) {
    return [
      { text: "Author: ", color: "cyan" },
      { text: line.slice(8), color: "white" },
    ];
  }

  // Date header: Date:   ...
  if (line.startsWith("Date:   ") || line.startsWith("Date: ")) {
    const idx = line.indexOf(":") + 1;
    return [
      { text: line.slice(0, idx) + " ", color: "gray" },
      { text: line.slice(idx).trim(), color: "gray", dimColor: true },
    ];
  }

  // Merge header: Merge: abc def
  if (line.startsWith("Merge: ")) {
    return [
      { text: "Merge: ", color: "cyan" },
      { text: line.slice(7), color: "gray" },
    ];
  }

  // Diff header: diff --git a/... b/...
  if (line.startsWith("diff --git ")) {
    return [{ text: line, color: "white", bold: true }];
  }

  // Diff index: index abc..def 100644
  if (line.startsWith("index ")) {
    return [{ text: line, color: "gray", dimColor: true }];
  }

  // File addition header: +++ b/...
  if (line.startsWith("+++")) {
    return [{ text: line, color: "green", bold: true }];
  }

  // Stat separator: ---
  if (line.trim() === "---") {
    return [{ text: line, color: "gray", dimColor: true }];
  }

  // File deletion header: --- a/...
  if (line.startsWith("---")) {
    return [{ text: line, color: "red", bold: true }];
  }

  // Hunk header: @@ -1,4 +1,5 @@ ...
  if (line.startsWith("@@")) {
    const endIdx = line.indexOf("@@", 2);
    if (endIdx !== -1) {
      const hunk = line.slice(0, endIdx + 2);
      const rest = line.slice(endIdx + 2);
      return [
        { text: hunk, color: "cyan", bold: true },
        { text: rest, color: "gray", dimColor: true },
      ];
    }
    return [{ text: line, color: "cyan", bold: true }];
  }

  // Diff added line: +...
  if (line.startsWith("+")) {
    return [{ text: line, color: "green" }];
  }

  // Diff removed line: -...
  if (line.startsWith("-")) {
    return [{ text: line, color: "red" }];
  }

  // Mode and rename headers
  if (
    line.startsWith("new file mode ") ||
    line.startsWith("deleted file mode ") ||
    line.startsWith("similarity index ") ||
    line.startsWith("rename from ") ||
    line.startsWith("rename to ") ||
    line.startsWith("copy from ") ||
    line.startsWith("copy to ") ||
    (line.startsWith("Binary files ") && line.endsWith("differ"))
  ) {
    return [{ text: line, color: "yellow" }];
  }

  // Stat line: file.ext | 10 +++--- or file.ext | Bin ...
  const statMatch = /^(\s*)(.+?)(\s*\|\s*)(?:(\d+)(\s*)([+-]*)|(Bin.*))$/.exec(line);
  if (statMatch) {
    const [, lead, file, pipe, count, gap, plusMinus, bin] = statMatch;
    const spans: DiffSpan[] = [
      { text: lead + file, color: "white" },
      { text: pipe, color: "gray", dimColor: true },
    ];
    if (bin) {
      spans.push({ text: bin, color: "yellow" });
    } else {
      spans.push({ text: count + (gap || ""), color: "cyan" });
      let pluses = "";
      let minuses = "";
      for (const ch of plusMinus || "") {
        if (ch === "+") pluses += ch;
        else if (ch === "-") minuses += ch;
      }
      if (pluses) spans.push({ text: pluses, color: "green" });
      if (minuses) spans.push({ text: minuses, color: "red" });
    }
    return spans;
  }

  // Stat summary: 1 file changed, 2 insertions(+), 3 deletions(-)
  if (line.includes("changed") && (line.includes("insertion") || line.includes("deletion"))) {
    const parts = line.split(/,(?=\s*\d+)/);
    const spans: DiffSpan[] = [];
    for (let i = 0; i < parts.length; i++) {
      const p = (i > 0 ? "," : "") + parts[i];
      if (p.includes("insertion")) spans.push({ text: p, color: "green" });
      else if (p.includes("deletion")) spans.push({ text: p, color: "red" });
      else spans.push({ text: p, color: "white", bold: true });
    }
    return spans;
  }

  // Oneline commit log: e.g. 02e4088 message
  const onelineMatch = /^([0-9a-f]{7,40})\s+(.*)$/.exec(line);
  if (onelineMatch) {
    return [
      { text: onelineMatch[1] + " ", color: "yellow" },
      { text: onelineMatch[2], color: "white" },
    ];
  }

  // Untracked / notice: (untracked ...) or (no diff ...)
  if (line.startsWith("(") && line.endsWith(")")) {
    return [{ text: line, color: "gray", dimColor: true }];
  }

  // Commit message body indented: "    subject"
  if (line.startsWith("    ")) {
    return [{ text: line, color: "white" }];
  }

  return [{ text: line }];
}
