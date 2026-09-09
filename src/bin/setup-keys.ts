#!/usr/bin/env node
// Automatically or manually registers prefix+. (or --key) to Open Git Tab in Herdr config.toml.
// Idempotent: re-running changes nothing when an active binding already exists.
import { DEFAULT_KEY, configPath, ensureKeybinding, reloadConfig } from "../setupKeys.js";

function usage(): void {
  console.log(
    "Usage: node dist/bin/setup-keys.js [--key <binding>] [--no-reload] [--auto]\n" +
      `Default binding: ${DEFAULT_KEY}. Writes one [[keys.command]] block to your\n` +
      "Herdr config.toml (created when missing), then reloads the server.\n" +
      "--auto: runs quietly during plugin install/build/startup; warns instead of failing.",
  );
}

let key = DEFAULT_KEY;
let noReload = false;
let auto = false;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--key" && i + 1 < process.argv.length) key = process.argv[++i]!;
  else if (a.startsWith("--key=")) key = a.slice("--key=".length);
  else if (a === "--no-reload") noReload = true;
  else if (a === "--auto") auto = true;
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
  const msg = `setup-keys: ${e instanceof Error ? e.message : String(e)}`;
  if (auto) {
    console.warn(msg);
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
}

try {
  const { changed } = ensureKeybinding(key, path);
  if (!changed) {
    if (!auto) {
      console.log(`Keybinding already present in ${path} — nothing to do.`);
    }
    process.exit(0);
  }

  console.log(`Added "${key}" → Open Git Tab to ${path}.`);

  if (noReload) {
    if (!auto) {
      console.log("Skipping reload (--no-reload). Run `herdr server reload-config` to apply.");
    }
    process.exit(0);
  }

  if (await reloadConfig()) {
    console.log(`Reloaded config. Press ${key} (after your Herdr prefix) to open the Git tab.`);
  } else if (!auto) {
    console.log("Herdr server not reachable. Run `herdr server reload-config` to apply.");
  }
} catch (e) {
  const msg = `setup-keys failed: ${e instanceof Error ? e.message : String(e)}`;
  if (auto) {
    console.warn(msg);
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
}
