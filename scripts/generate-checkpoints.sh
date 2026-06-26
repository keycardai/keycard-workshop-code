#!/usr/bin/env bash
#
# Break-glass: materialize a known-good checkpoint from its cp-* tag when you
# fall behind mid-chapter and want a clean copy to jump into.
#
# The two endpoint checkpoints already ship in the repo, so you do NOT need this
# for them: support-escalation/ is Chapter 0 (your working copy) and mcp-server/
# is the finished server (Chapters 6-7). Use this for the in-between checkpoints
# (Chapters 2, 4, 5).
#
# Output goes to _recovery/<name>/ (gitignored) so it never disturbs your work.
#
# Usage:  scripts/generate-checkpoints.sh <chapter|tag>
#   e.g.  scripts/generate-checkpoints.sh 4        # by chapter number
#         scripts/generate-checkpoints.sh cp-2     # by tag
# Reads:  checkpoints.tsv  (<tag><TAB><name><TAB><end-of-chapter>)

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

manifest="checkpoints.tsv"
[[ -f "$manifest" ]] || { echo "error: $manifest not found"; exit 1; }

arg="${1:-}"
[[ -n "$arg" ]] || { echo "usage: scripts/generate-checkpoints.sh <chapter|tag>  (e.g. 4 or cp-2)"; exit 1; }

# Resolve the arg against the manifest: match either the tag or the chapter column.
tag="" name=""
while IFS=$'\t' read -r t n ch; do
  [[ -z "${t// /}" || "${t:0:1}" == "#" ]] && continue
  if [[ "$arg" == "$t" || "$arg" == "$ch" ]]; then tag="$t"; name="$n"; break; fi
done < "$manifest"

[[ -n "$tag" ]] || { echo "error: no checkpoint matches '$arg'. Known chapters: $(grep -v '^#' "$manifest" | cut -f3 | tr '\n' ' ')"; exit 1; }

git rev-parse -q --verify "refs/tags/${tag}" >/dev/null || { echo "error: tag '${tag}' does not exist"; exit 1; }

out="_recovery/${name}"
echo "materialize: ${tag} -> ${out}/"
rm -rf "${out}"
mkdir -p "${out}"
# Archive only the app subtree; --strip-components drops the mcp-server/ prefix
# so files land at the folder root. node_modules/dist/.env are untracked, so
# they're never in the archive — the copy comes out clean, ready for npm install.
git archive "${tag}" mcp-server | tar -x --strip-components=1 -C "${out}"

echo "done. Next:"
echo "  cp support-escalation/.env ${out}/   # bring your env values along"
echo "  cd ${out} && npm install && npm run dev"
