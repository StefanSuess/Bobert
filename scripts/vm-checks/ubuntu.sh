#!/usr/bin/env bash
# Bobert 1.0.0 short checks on Linux (run in a terminal; sudo asks for your password once).
# Clones the public repo at commit 18af368, runs the automated checks and writes a summary to ~/bobert-vm-result.txt.
set -u
OUT="$HOME/bobert-vm-result.txt"; : > "$OUT"
say() { echo "$*" | tee -a "$OUT"; }
say "date: $(date -u +%FT%TZ)  os: $(. /etc/os-release; echo $PRETTY_NAME)  arch: $(uname -m)"
sudo apt-get update -qq && sudo apt-get install -y -qq git curl xvfb libnss3 libgbm1 libasound2t64 libgtk-3-0 >/dev/null 2>&1 || say "apt step had issues"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - >/dev/null 2>&1 && sudo apt-get install -y -qq nodejs >/dev/null 2>&1
fi
say "node: $(node -v)"
command -v pnpm >/dev/null || sudo npm install -g pnpm >/dev/null 2>&1
command -v pnpm >/dev/null || { say "pnpm missing: stopped"; exit 1; }
say "pnpm: $(pnpm -v)"
cd "$HOME" && rm -rf bobert-vm && git clone -q https://github.com/StefanSuess/Bobert.git bobert-vm && cd bobert-vm && git checkout -q "${BOBERT_REF:-18af368}" && say "commit: $(git rev-parse --short=12 HEAD)"
pnpm install --frozen-lockfile >/dev/null 2>&1 && say "install: ok" || say "install: FAIL"
pnpm typecheck >/dev/null 2>&1 && say "typecheck: ok" || say "typecheck: FAIL"
pnpm test 2>&1 | grep -E "^ℹ (pass|fail|skipped)" | tr '\n' ' ' | tee -a "$OUT"; echo | tee -a "$OUT"
pnpm test:release 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' ' | tee -a "$OUT"; echo | tee -a "$OUT"
pnpm release:build "$HOME/bobert-vm-candidate.vsix" >/dev/null 2>&1 && say "vsix build: ok" || say "vsix build: FAIL"
xvfb-run -a pnpm test:host "$HOME/bobert-vm-candidate.vsix" 2>&1 | tail -5 | tee -a "$OUT"
say "done. Result file: $OUT"
