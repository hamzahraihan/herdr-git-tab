import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ACTION_ID,
  DEFAULT_KEY,
  configPath,
  ensureKeybinding,
  installBlock,
  keybindingBlock,
  needsInstall,
} from "../src/setupKeys.js";

describe("configPath", () => {
  it("honors HERDR_CONFIG_PATH over platform defaults", () => {
    expect(configPath({ HERDR_CONFIG_PATH: "/custom/config.toml" }, "win32")).toBe(
      "/custom/config.toml",
    );
  });

  it("resolves the Windows default from APPDATA", () => {
    expect(configPath({ APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, "win32")).toBe(
      "C:\\Users\\me\\AppData\\Roaming\\herdr\\config.toml",
    );
  });
  it("resolves the posix default from HOME", () => {
    expect(configPath({ HOME: "/home/me" }, "linux")).toBe("/home/me/.config/herdr/config.toml");
  });

  it("throws when no home is known", () => {
    expect(() => configPath({}, "linux")).toThrow();
  });
});

describe("keybindingBlock", () => {
  it("binds the key to the open-git-tab action", () => {
    const block = keybindingBlock(DEFAULT_KEY);
    expect(block).toContain(`key = "${DEFAULT_KEY}"`);
    expect(block).toContain(`command = "${ACTION_ID}"`);
    expect(block).toContain("[[keys.command]]");
  });
});

describe("needsInstall", () => {
  it("detects a missing or present binding", () => {
    expect(needsInstall("")).toBe(true);
    expect(needsInstall(keybindingBlock(DEFAULT_KEY))).toBe(false);
    expect(needsInstall(`command = "${ACTION_ID}"`)).toBe(false);
  });
});

describe("installBlock", () => {
  it("creates a clean file from empty content", () => {
    expect(installBlock("", DEFAULT_KEY)).toBe(`${keybindingBlock(DEFAULT_KEY)}\n`);
  });

  it("appends with a blank-line gap and trailing newline", () => {
    const out = installBlock('[ui]\ntheme = "dark"', DEFAULT_KEY);
    expect(out).toBe(`[ui]\ntheme = "dark"\n\n${keybindingBlock(DEFAULT_KEY)}\n`);
  });

  it("is idempotent through needsInstall", () => {
    expect(needsInstall(installBlock("", DEFAULT_KEY))).toBe(false);
  });
});

describe("ensureKeybinding", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("creates the config with the block and leaves reruns untouched", () => {
    const dir = mkdtempSync(join(tmpdir(), "herdr-keys-"));
    dirs.push(dir);
    const file = join(dir, "sub", "config.toml");
    const first = ensureKeybinding(DEFAULT_KEY, file);
    expect(first).toEqual({ path: file, changed: true });
    const before = readFileSync(file, "utf8");
    expect(before).toContain(ACTION_ID);
    const second = ensureKeybinding(DEFAULT_KEY, file);
    expect(second).toEqual({ path: file, changed: false });
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("preserves existing user content", () => {
    const dir = mkdtempSync(join(tmpdir(), "herdr-keys-"));
    dirs.push(dir);
    const file = join(dir, "config.toml");
    writeFileSync(file, '[ui]\ntheme = "dark"\n');
    ensureKeybinding("prefix+g", file);
    const content = readFileSync(file, "utf8");
    expect(content).toContain('theme = "dark"');
    expect(content).toContain('key = "prefix+g"');
  });
});
