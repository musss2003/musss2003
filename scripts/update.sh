#!/usr/bin/env bash
# Daily: redraw the cards from local git and push them if anything changed.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin:/usr/local/bin:/usr/bin:$PATH"
git pull -q --rebase
node scripts/render.mjs
git add assets
git diff --cached --quiet || { git commit -q -m "chore: redraw profile cards"; git push -q; }
