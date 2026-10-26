#!/usr/bin/env bash
# Bobert release-candidate smoke test on Ubuntu (synthetic demo only, never your Kiro profile).
# Put the exact CI candidate VSIX on the desktop, then run:
#   curl -fsSL https://raw.githubusercontent.com/StefanSuess/Bobert/chore/vm-smoke/scripts/vm-checks/smoke-ubuntu.sh | bash
set -u
REF="${BOBERT_REF:-ea6a9c0679ca}"; SHA="${BOBERT_SHA256:-f0bacc7124eeda9855eef71d29ad023afa8781f8e6b71ca1ddbc01968229c8b5}"
V=$(find "$HOME" -maxdepth 3 -name 'bobert-v*-candidate.vsix' 2>/dev/null | head -1)
[ -n "$V" ] || { echo "No bobert-v*-candidate.vsix found in your home folder."; exit 1; }
[ "$(sha256sum "$V" | cut -d' ' -f1)" = "$SHA" ] && echo "SHA-256 OK: $V" || { echo "SHA-256 MISMATCH: $V"; exit 1; }
sudo apt-get update -qq && sudo apt-get install -y -qq git curl >/dev/null 2>&1
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - >/dev/null 2>&1 && sudo apt-get install -y -qq nodejs >/dev/null 2>&1; fi
command -v pnpm >/dev/null || sudo npm install -g pnpm >/dev/null 2>&1
cd "$HOME" && rm -rf bobert-smoke && git clone -q https://github.com/StefanSuess/Bobert.git bobert-smoke && cd bobert-smoke && git checkout -q "$REF"
pnpm install --frozen-lockfile >/dev/null 2>&1 || { echo "INSTALL FAILED"; exit 1; }
OUT=$(pnpm demo:setup --install --vsix "$V" 2>&1); echo "$OUT" | tail -8
D=$(echo "$OUT" | sed -n 's/^Demo folder: //p'); [ -n "$D" ] || exit 1
# Keep two updates so the "collecting" view (allowance and at-least average) shows.
L=$(find "$D/source" -name q-client.log | head -1); tail -n 2 "$L" > "$L.tmp" && mv "$L.tmp" "$L" && chmod 600 "$L"
node "$D/open-demo.mjs"; echo "Demo folder (delete after the test, it holds your sign-in): $D"
