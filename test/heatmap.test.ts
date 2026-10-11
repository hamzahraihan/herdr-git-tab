import { describe, expect, it } from "vitest";
import {
  buildHeatmapData,
  calculateLevel,
  calculateStreaks,
  formatDisplayDate,
  formatMonthLabels,
  formatYMD,
  parseHeatmapLine,
  parseHeatmapOutput,
} from "../src/git.js";
import { TABS, tabsTotalWidth } from "../src/views/TabBar.js";

describe("parseHeatmapLine", () => {
  it("parses valid date and author separated by unit separator", () => {
    const entry = parseHeatmapLine("2026-09-09\x1fAlice");
    expect(entry).toEqual({ date: "2026-09-09", author: "Alice" });
  });

  it("parses date-only line when valid YYYY-MM-DD", () => {
    const entry = parseHeatmapLine("2026-10-10");
    expect(entry).toEqual({ date: "2026-10-10", author: "" });
  });

  it("returns null for empty or whitespace-only lines", () => {
    expect(parseHeatmapLine("")).toBeNull();
    expect(parseHeatmapLine("   \n\t")).toBeNull();
  });

  it("returns null for malformed dates", () => {
    expect(parseHeatmapLine("invalid-date\x1fAlice")).toBeNull();
    expect(parseHeatmapLine("2026-9-9\x1fAlice")).toBeNull();
  });
});

describe("parseHeatmapOutput", () => {
  it("parses multi-line stdout into array of entries", () => {
    const stdout = [
      "2026-09-08\x1fAlice",
      "",
      "2026-09-09\x1fBob",
      "malformed line",
      "2026-09-10\x1fCharlie",
    ].join("\n");

    const entries = parseHeatmapOutput(stdout);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ date: "2026-09-08", author: "Alice" });
    expect(entries[1]).toEqual({ date: "2026-09-09", author: "Bob" });
    expect(entries[2]).toEqual({ date: "2026-09-10", author: "Charlie" });
  });

  it("returns empty array for empty stdout", () => {
    expect(parseHeatmapOutput("")).toEqual([]);
  });
});

describe("formatYMD & formatDisplayDate", () => {
  it("formats Date as YYYY-MM-DD", () => {
    const d = new Date(2026, 8, 9); // Month is 0-indexed: 8 = Sep
    expect(formatYMD(d)).toBe("2026-09-09");
  });

  it("formats display date with day of week and month name", () => {
    // 2026-10-10 is Saturday
    expect(formatDisplayDate("2026-10-10")).toBe("Saturday, Oct 10, 2026");
    // 2026-09-09 is Wednesday
    expect(formatDisplayDate("2026-09-09")).toBe("Wednesday, Sep 9, 2026");
  });
});

describe("calculateStreaks", () => {
  it("returns 0 for empty counts", () => {
    const streaks = calculateStreaks({}, new Date(2026, 9, 10));
    expect(streaks).toEqual({ currentStreak: 0, longestStreak: 0 });
  });

  it("calculates current and longest streak with consecutive active days", () => {
    const today = new Date(2026, 9, 10);
    const counts = {
      "2026-10-08": 2,
      "2026-10-09": 1,
      "2026-10-10": 4,
    };
    const streaks = calculateStreaks(counts, today);
    expect(streaks.currentStreak).toBe(3);
    expect(streaks.longestStreak).toBe(3);
  });

  it("maintains current streak when today has no commits but yesterday was active", () => {
    const today = new Date(2026, 9, 10); // Saturday
    const counts = {
      "2026-10-08": 2,
      "2026-10-09": 3, // Friday (yesterday)
      // Saturday has 0 commits
    };
    const streaks = calculateStreaks(counts, today);
    expect(streaks.currentStreak).toBe(2);
    expect(streaks.longestStreak).toBe(2);
  });

  it("tracks longest streak across gaps", () => {
    const today = new Date(2026, 9, 10);
    const counts = {
      // 4-day streak in September
      "2026-09-01": 1,
      "2026-09-02": 3,
      "2026-09-03": 2,
      "2026-09-04": 5,
      // gap
      "2026-10-10": 1, // 1-day current streak
    };
    const streaks = calculateStreaks(counts, today);
    expect(streaks.currentStreak).toBe(1);
    expect(streaks.longestStreak).toBe(4);
  });
});

describe("calculateLevel", () => {
  it("returns 0 for 0 or negative counts", () => {
    expect(calculateLevel(0, 10)).toBe(0);
    expect(calculateLevel(-1, 10)).toBe(0);
  });

  it("scales directly for maxCount <= 4", () => {
    expect(calculateLevel(1, 4)).toBe(1);
    expect(calculateLevel(2, 4)).toBe(2);
    expect(calculateLevel(3, 4)).toBe(3);
    expect(calculateLevel(4, 4)).toBe(4);
  });

  it("calculates quartiles for larger maxCount", () => {
    const max = 20; // q1=5, q2=10, q3=15
    expect(calculateLevel(3, max)).toBe(1);
    expect(calculateLevel(5, max)).toBe(1);
    expect(calculateLevel(6, max)).toBe(2);
    expect(calculateLevel(10, max)).toBe(2);
    expect(calculateLevel(11, max)).toBe(3);
    expect(calculateLevel(15, max)).toBe(3);
    expect(calculateLevel(16, max)).toBe(4);
    expect(calculateLevel(20, max)).toBe(4);
  });
});

describe("formatMonthLabels", () => {
  it("generates month label string with correct width", () => {
    const startSunday = new Date(2025, 9, 12);
    const labels = formatMonthLabels(startSunday, 52, 2);
    expect(labels.length).toBe(104);
    expect(labels).toContain("Oct");
    expect(labels).toContain("Nov");
    expect(labels).toContain("Dec");
    expect(labels).toContain("Jan");
  });
});

describe("buildHeatmapData", () => {
  it("builds weeks grid and aggregates stats", () => {
    const today = new Date(2026, 9, 10); // Sat Oct 10, 2026
    const entries = [
      { date: "2026-10-10", author: "Alice" },
      { date: "2026-10-10", author: "Bob" },
      { date: "2026-10-09", author: "Alice" },
      { date: "2026-09-01", author: "Charlie" },
    ];

    const data = buildHeatmapData(entries, { numWeeks: 12, today });
    expect(data.weeks).toHaveLength(12);
    expect(data.totalCommits).toBe(4);
    expect(data.activeDays).toBe(3);
    expect(data.maxDayCount).toBe(2);
    expect(data.peakDate).toBe("2026-10-10");

    // Check that each week has 7 days
    for (const week of data.weeks) {
      expect(week.days).toHaveLength(7);
    }

    // Check the latest week, last day (Saturday Oct 10)
    const latestWeek = data.weeks[11]!;
    const saturday = latestWeek.days[6]!;
    expect(saturday.date).toBe("2026-10-10");
    expect(saturday.count).toBe(2);
    expect(saturday.level).toBeGreaterThan(0);
    expect(saturday.inRange).toBe(true);
  });

  it("filters entries when filterQuery is provided", () => {
    const today = new Date(2026, 9, 10);
    const entries = [
      { date: "2026-10-10", author: "Alice" },
      { date: "2026-10-10", author: "Bob" },
      { date: "2026-10-09", author: "Alice" },
    ];

    const data = buildHeatmapData(entries, {
      numWeeks: 12,
      today,
      filterQuery: "Alice",
    });

    expect(data.totalCommits).toBe(2);
    expect(data.activeDays).toBe(2);
    expect(data.maxDayCount).toBe(1);
  });
});

describe("TabBar TABS definition", () => {
  it("includes Tab 7 Heatmap", () => {
    const heatmapTab = TABS.find((t) => t.id === 7);
    expect(heatmapTab).toBeDefined();
    expect(heatmapTab?.label).toBe("Heatmap");
    expect(TABS).toHaveLength(7);
  });

  it("calculates total tabs width correctly", () => {
    const total = tabsTotalWidth();
    expect(total).toBeGreaterThan(50);
  });
});
