#!/usr/bin/env bash
# Commits a validated build output to the index data branch and pushes it.
#
# Usage: scripts/publish-index.sh <output-dir> [branch]
#
# The branch holds only the build output. A run whose output differs from the
# branch in generated_at alone makes no commit. Set PUBLISH_DRY_RUN=1 to commit
# in a temporary worktree without pushing.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <output-dir> [branch]" >&2
  exit 2
fi

out_dir=$(cd "$1" && pwd)
branch=${2:-index}
remote=${PUBLISH_REMOTE:-origin}
repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

node dist/src/cli.js validate "$out_dir"

work=$(mktemp -d)
temp_branch="publish-index-$$"
cleanup() {
  git worktree remove --force "$work" >/dev/null 2>&1 || true
  rm -rf "$work"
  git branch -D "$temp_branch" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if git ls-remote --exit-code --heads "$remote" "$branch" >/dev/null; then
  git fetch --quiet --depth 1 "$remote" "refs/heads/$branch"
  git worktree add --quiet --detach "$work" FETCH_HEAD
  has_parent=1
else
  git worktree add --quiet --detach "$work"
  git -C "$work" checkout --quiet --orphan "$temp_branch"
  git -C "$work" rm -rfq --ignore-unmatch .
  has_parent=0
fi

find "$work" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$out_dir"/. "$work"/
git -C "$work" add -A

changed=$(git -C "$work" diff --cached --name-only)
if [ -z "$changed" ]; then
  echo "Index unchanged; nothing to publish."
  exit 0
fi

# Skip a commit that would only move generated_at.
if [ "$has_parent" = 1 ] && ! echo "$changed" | grep -qv '/index\.json$'; then
  only_timestamp=1
  while IFS= read -r file; do
    if ! node -e '
      const fs = require("node:fs");
      const strip = (text) => { const data = JSON.parse(text); delete data.generated_at; return JSON.stringify(data); };
      const [before, after] = [fs.readFileSync(0, "utf8"), fs.readFileSync(process.argv[1], "utf8")];
      process.exit(strip(before) === strip(after) ? 0 : 1);
    ' "$work/$file" < <(git -C "$work" show "HEAD:$file" 2>/dev/null || echo '{}'); then
      only_timestamp=0
      break
    fi
  done <<< "$changed"
  if [ "$only_timestamp" = 1 ]; then
    echo "Only generated_at changed; nothing to publish."
    exit 0
  fi
fi

revision=$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).revision.slice(0, 7))' \
  "$(find "$out_dir" -mindepth 2 -maxdepth 2 -name index.json | sort | head -n 1)")
git -C "$work" commit --quiet -m "chore: build docs index ${revision}"
echo "Committed $(git -C "$work" rev-parse --short HEAD) for docs revision ${revision}."

if [ "${PUBLISH_DRY_RUN:-0}" = 1 ]; then
  git -C "$work" log --stat --oneline -1 | tail -n 3
  echo "Dry run; not pushing."
  exit 0
fi

git -C "$work" push --quiet "$remote" "HEAD:refs/heads/$branch"
echo "Pushed to $remote $branch."
