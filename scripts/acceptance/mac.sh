#!/usr/bin/env bash
# Sets up the native acceptance environment on macOS: invented usage, invented workspace, the extension pre-installed
# in an isolated Kiro profile, and an opened Kiro window. Kiro asks YOU to sign in (nobody else may); the demo folder holds that
# login afterwards, so delete it when done. Env: BOBERT_REF (default main), BOBERT_VSIX (candidate path; default builds the checkout),
# BOBERT_TESTS=1 (also run the automated tests), BOBERT_DIR (checkout folder, default ~/bobert-acceptance).
set -eu
REF="${BOBERT_REF:-main}"; DIR="${BOBERT_DIR:-$HOME/bobert-acceptance}"; OUT="$HOME/bobert-acceptance-result.txt"; : > "$OUT"
say() { echo "$*" | tee -a "$OUT"; }
say "date: $(date -u +%FT%TZ)  os: macOS $(sw_vers -productVersion)  arch: $(uname -m)"
command -v git >/dev/null || { say "git missing: install Xcode command line tools (xcode-select --install)"; exit 1; }
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  if command -v brew >/dev/null; then brew install node >/dev/null 2>&1; else say "Node 24+ missing and Homebrew not found: install Node 24 from nodejs.org"; exit 1; fi
fi
command -v pnpm >/dev/null || npm install -g pnpm >/dev/null 2>&1
say "node: $(node -v)  pnpm: $(pnpm -v)"
[ -d "$DIR/.git" ] || git clone -q https://github.com/StefanSuess/Bobert.git "$DIR"
cd "$DIR" && git fetch -q origin && { git checkout -q --detach "origin/$REF" 2>/dev/null || git checkout -q --detach "$REF"; } && say "commit: $(git rev-parse --short=12 HEAD)"
pnpm install --frozen-lockfile >/dev/null 2>&1 || { say "install: FAIL"; exit 1; }
if [ "${BOBERT_TESTS:-0}" = 1 ]; then
  pnpm typecheck >/dev/null 2>&1 && say "typecheck: ok" || say "typecheck: FAIL"
  say "$(pnpm test 2>&1 | grep -E '^ℹ (pass|fail)' | tr '\n' ' ')"
  say "$(pnpm test:release 2>&1 | grep -E '^ℹ (pass|fail)' | tr '\n' ' ')"
fi
ARGS=(--rich --install --pace high --open); [ -n "${BOBERT_VSIX:-}" ] && ARGS+=(--vsix "$BOBERT_VSIX")
if [ -x /Applications/Kiro.app/Contents/MacOS/Kiro ]; then
  pnpm demo:setup "${ARGS[@]}" | tee -a "$OUT"
else
  say "KIRO_NOT_FOUND: install Kiro IDE to /Applications first, then run this script again."
  pnpm demo:setup --rich --pace high | tee -a "$OUT"
fi
say "Next: sign in to Kiro in the DEMO window, hide the status bar item 'Usage Meter' (it shows your real usage), then follow docs/test-inventory.md."
say "Chat hints: run the 'Invented chat session' command printed above. Delete the demo folder afterwards (it holds your login)."
