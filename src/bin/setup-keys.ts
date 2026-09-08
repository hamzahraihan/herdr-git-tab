#!/usr/bin/env node
// Run once after install/link to bind prefix+. (or --key) to Open Git Tab.
// Idempotent: re-running changes nothing when the binding already exists.
import { DEFAULT_KEY, configPath, ensureKeybinding, reloadConfig } from "../setupKeys.js";

function usage(): void {
  console.log(
    "Usage: node dist/bin/setup-keys.js [--key <binding>] [--no-reload]\n" +
      `Default binding: ${DEFAULT_KEY}. Writes one [[keys.command]] block to your\n` +
      "Herdr config.toml (created when missing), then reloads the server.",
  );
}

let key = DEFAULT_KEY;
let noReload = false;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--key" && i + 1 < process.argv.length) key = process.argv[++i]!;
  else if (a.startsWith("--key=")) key = a.slice("--key=".length);
  else if (a === "--no-reload") noReload = true;
  else if (a === "--help" || a === "-h") {
    usage();
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${a}`);
    usage();
    process.exit(2);
  }
}

let path: string;
try {
  path = configPath();
} catch (e) {
  console.error(`setup-keys failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const { changed } = ensureKeybinding(key, path);
if (!changed) {
  console.log(`Keybinding already present in ${path} — nothing to do.`);
  process.exit(0);
}
console.log(`Added "${key}" → Open Git Tab to ${path}.`);

if (noReload) {
  console.log("Skipping reload (--no-reload). Run `herdr server reload-config` to apply.");
  process.exit(0);
}
if (await reloadConfig()) {
  console.log(`Reloaded config. Press ${key} (after your Herdr prefix) to open the Git tab.`);
} else {
  console.log("Herdr server not reachable. Run `herdr server reload-config` to apply.");
}
