import { firstLine, messageOf } from "../format.js";

export function errorLine(error, fallback) {
  return firstLine(messageOf(error), fallback);
}

export function stripPrefix(text) {
  return String(text ?? "").replace(/^(GH|GIT)_UNAVAILABLE:\s*/, "");
}
