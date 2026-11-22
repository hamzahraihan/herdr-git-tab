// Small, dependency-free formatting and path helpers shared by the panels.

export const DAY_MS = 86_400_000;
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** First non-empty line of a command's stderr/stdout, for an actionable error. */
export function firstLine(text, fallback = "") {
  if (text === null || text === undefined) return fallback;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length > 0) return line;
  }
  return fallback;
}

export function messageOf(error) {
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Local YYYY-MM-DD. The heatmap is about the person's calendar, not UTC. */
export function formatYMD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function displayDate(dateStrRest) {
  const [year, month, day] = String(dateStrRest).split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** Short relative age (`2h`, `1d`); invalid and future dates stay quiet. */
export function relativeTime(iso, nowMs = Date.now()) {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const seconds = Math.max(0, Math.floor((nowMs - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

/** Human span between two ISO timestamps: `3 days`, `4 weeks`, `2 months`. */
export function humanizeSpan(oldest, newest) {
  if (!oldest || !newest) return null;
  const from = Date.parse(oldest);
  const to = Date.parse(newest);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  const days = Math.floor((to - from) / DAY_MS);
  if (days < 1) return "today";
  if (days < 7) return plural(days, "day");
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return plural(weeks, "week");
  const months = Math.floor(days / 30);
  if (months < 12) return plural(months, "month");
  const years = Math.floor(days / 365);
  return plural(years, "year");
}

/** `https://github.com/x/y.git` and `git@github.com:x/y.git` both become host/path. */
export function normalizeRemoteUrl(raw) {
  let url = String(raw ?? "").trim().replace(/\.git$/, "");
  if (!url) return "";
  if (!url.includes("@")) {
    const https = /^(?:https?:\/\/)?([^/]+)\/(.+)$/.exec(url);
    if (https) return `${https[1]}/${https[2]}`;
  }
  const ssh = /^(?:[^@]+@)?([^:]+):(.+)$/.exec(url);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  return url;
}

export function repoName(path) {
  const clean = String(path ?? "").replace(/[/\\]+$/, "");
  const parts = clean.split(/[/\\]/);
  return parts[parts.length - 1] || path || "Git";
}

/** Remove ANSI escapes and C0 control characters (except \n, \t) so
 *  untrusted remote/commit text cannot inject terminal sequences or
 *  render as visible control garbage. */
export function sanitizeRenderText(text) {
  return String(text ?? "").replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)|[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}
/** Display width of plain text; wide CJK/emoji cells count as two, combining marks as zero. */
function charWidth(codePoint) {
  if (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  )
    return 0;
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0x303e) ||
    (codePoint >= 0x3041 && codePoint <= 0x33ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  )
    return 2;
  return 1;
}

export function cellWidth(text) {
  let width = 0;
  for (const char of String(text ?? "")) width += charWidth(char.codePointAt(0));
  return width;
}

export function truncateToWidth(text, max) {
  const clean = sanitizeRenderText(text);
  if (max < 1) return "";
  if (cellWidth(clean) <= max) return clean;
  let width = 0;
  let end = 0;
  for (const char of clean) {
    const w = charWidth(char.codePointAt(0));
    if (width + w > max - 1) break;
    width += w;
    end += char.length;
  }
  return `${clean.slice(0, end)}…`;
}

/** Scale values to bar widths: the leader fills `maxWidth`, others proportionally. */
export function scaleBars(values, maxWidth) {
  const max = Math.max(0, ...values);
  if (max <= 0 || maxWidth <= 0) return values.map(() => 0);
  return values.map((value) => (value <= 0 ? 0 : Math.max(1, Math.round((value / max) * maxWidth))));
}

export function normPath(path) {
  let value = String(path ?? "").replace(/\\/g, "/");
  if (value.length > 1 && value.endsWith("/") && !/^[A-Za-z]:\/$/.test(value)) value = value.replace(/\/+$/, "");
  return value;
}

/** Whether `path` is `root` or below it, on the same machine. */
export function isInside(path, root) {
  let p = normPath(path);
  let r = normPath(root);
  if (!p || !r) return false;
  if (/^[A-Za-z]:\//.test(p) || /^[A-Za-z]:\//.test(r)) {
    p = p.toLowerCase();
    r = r.toLowerCase();
  }
  if (p === r) return true;
  return p.startsWith(r.endsWith("/") ? r : `${r}/`);
}

export function shortFolder(path, budget = 64) {
  const value = normPath(path);
  if (value.length <= budget) return value;
  const parts = value.split("/");
  return `…/${parts.slice(-3).join("/")}`;
}
