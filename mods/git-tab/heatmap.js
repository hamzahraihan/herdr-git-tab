// GitHub-style contribution calendar: weeks start on Sunday, like the grid.
// Pure data and date work; the view decides how the squares look.

import { DAY_MS, clamp, formatYMD } from "./format.js";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatDisplayDate(dateStr) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  return `${DAY_NAMES[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** Split one `git log --date=short --pretty=format:%ad%x1f%an` line. */
export function parseHeatmapLine(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return null;
  const at = trimmed.indexOf("\x1f");
  if (at === -1) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { date: trimmed, author: "" };
    return null;
  }
  const date = trimmed.slice(0, at).trim();
  const author = trimmed.slice(at + 1).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { date, author };
}

export function parseHeatmapOutput(stdout) {
  const entries = [];
  for (const line of String(stdout ?? "").split("\n")) {
    const entry = parseHeatmapLine(line);
    if (entry) entries.push(entry);
  }
  return entries;
}

export function calculateStreaks(counts, today = new Date()) {
  const activeDates = Object.keys(counts)
    .filter((date) => (counts[date] ?? 0) > 0)
    .sort();

  if (activeDates.length === 0) return { currentStreak: 0, longestStreak: 0 };

  let longestStreak = 0;
  let streak = 0;
  let previous = null;

  for (const dateStr of activeDates) {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(year, (month ?? 1) - 1, day ?? 1);
    if (previous) {
      const days = Math.round((date.getTime() - previous.getTime()) / DAY_MS);
      streak = days === 1 ? streak + 1 : 1;
    } else {
      streak = 1;
    }
    if (streak > longestStreak) longestStreak = streak;
    previous = date;
  }

  let currentStreak = 0;
  const check = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let key = formatYMD(check);
  if ((counts[key] ?? 0) === 0) {
    check.setDate(check.getDate() - 1);
    key = formatYMD(check);
  }
  while ((counts[key] ?? 0) > 0) {
    currentStreak++;
    check.setDate(check.getDate() - 1);
    key = formatYMD(check);
  }

  return { currentStreak, longestStreak };
}

/** Quartiles against the busiest day, like GitHub's four greens. */
export function calculateLevel(count, maxCount) {
  if (count <= 0) return 0;
  if (maxCount <= 4) return Math.min(4, count);
  const q1 = Math.ceil(maxCount * 0.25);
  const q2 = Math.ceil(maxCount * 0.5);
  const q3 = Math.ceil(maxCount * 0.75);
  if (count <= q1) return 1;
  if (count <= q2) return 2;
  if (count <= q3) return 3;
  return 4;
}

/** A month-name strip aligned to week columns, for text-only output. */
export function formatMonthLabels(startSunday, numWeeks, colWidth = 2) {
  const chars = Array(numWeeks * colWidth).fill(" ");
  let lastEnd = -1;
  for (let week = 0; week < numWeeks; week++) {
    const start = new Date(startSunday);
    start.setDate(startSunday.getDate() + week * 7);
    for (let day = 0; day < 7; day++) {
      const date = new Date(start);
      date.setDate(start.getDate() + day);
      if (date.getDate() === 1 || (week === 0 && day === 0)) {
        const name = MONTHS[date.getMonth()];
        const at = week * colWidth;
        if (at >= lastEnd + 1 && at + name.length <= chars.length) {
          for (let index = 0; index < name.length; index++) chars[at + index] = name[index];
          lastEnd = at + name.length;
        }
        break;
      }
    }
  }
  return chars.join("");
}

/** One label per month segment, with the number of week columns it spans. */
export function monthSegments(weeks) {
  const segments = [];
  for (let index = 0; index < weeks.length; index++) {
    const days = weeks[index]?.days ?? [];
    const startsMonth = days.some((cell) => cell.date.endsWith("-01"));
    if (index === 0 || startsMonth) {
      const month = Number((days.find((cell) => cell.date.endsWith("-01")) ?? days[0])?.date?.slice(5, 7) ?? 1);
      const label = MONTHS[month - 1] ?? "Jan";
      if (segments.length && segments[segments.length - 1].label === label) {
        segments[segments.length - 1].span++;
      } else {
        segments.push({ label, start: index, span: 1 });
      }
    } else if (segments.length) {
      segments[segments.length - 1].span++;
    }
  }
  return segments;
}

export function heatmapWeeks(width) {
  const available = Math.max(220, Number(width) || 560) - 72;
  return clamp(Math.floor(available / 14), 12, 52);
}

export function buildHeatmapData(entries, options = {}) {
  const numWeeks = clamp(Math.floor(options.numWeeks ?? 52), 1, 104);
  const today = options.today ?? new Date();
  const filter = String(options.filterQuery ?? "").trim().toLowerCase();

  const filtered = filter
    ? (entries ?? []).filter((entry) => {
        const author = String(entry.author ?? "").toLowerCase();
        const date = String(entry.date ?? "");
        return author.includes(filter) || date.includes(filter);
      })
    : entries ?? [];

  const todayStr = formatYMD(today);
  const currentSunday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  currentSunday.setDate(currentSunday.getDate() - currentSunday.getDay());
  const startSunday = new Date(currentSunday);
  startSunday.setDate(startSunday.getDate() - (numWeeks - 1) * 7);
  const startStr = formatYMD(startSunday);

  const counts = Object.create(null);
  for (const entry of filtered) {
    const date = String(entry.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (date < startStr || date > todayStr) continue;
    counts[date] = (counts[date] ?? 0) + 1;
  }

  let totalCommits = 0;
  let activeDays = 0;
  let maxDayCount = 0;
  let peakDate = null;
  for (const [date, count] of Object.entries(counts)) {
    totalCommits += count;
    if (count > 0) activeDays++;
    if (count > maxDayCount) {
      maxDayCount = count;
      peakDate = date;
    }
  }

  const weeks = [];
  for (let week = 0; week < numWeeks; week++) {
    const days = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(startSunday);
      date.setDate(startSunday.getDate() + week * 7 + day);
      const dateStr = formatYMD(date);
      const inRange = date <= today;
      const count = inRange ? counts[dateStr] ?? 0 : 0;
      days.push({ date: dateStr, count, level: inRange ? calculateLevel(count, maxDayCount) : 0, inRange });
    }
    weeks.push({ days });
  }

  const streaks = calculateStreaks(counts, today);
  return {
    weeks,
    monthLabels: formatMonthLabels(startSunday, numWeeks, 2),
    totalCommits,
    activeDays,
    currentStreak: streaks.currentStreak,
    longestStreak: streaks.longestStreak,
    maxDayCount,
    peakDate,
    startDate: startStr,
    endDate: todayStr,
  };
}
