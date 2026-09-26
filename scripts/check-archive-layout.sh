#!/usr/bin/env bash
set -euo pipefail

for page in docs/post/index.html docs/en/post/index.html; do
  if ! grep -Eq 'readability\.css\?v=[0-9a-f]{32}' "$page"; then
    echo "Archive layout check failed: versioned stylesheet missing from $page" >&2
    exit 1
  fi

  card_count=$(grep -c 'class="blog-summary-card"' "$page")
  if [[ "$card_count" -ne 5 ]]; then
    echo "Archive layout check failed: expected 5 summaries in $page, found $card_count" >&2
    exit 1
  fi

  if ! grep -q 'class="blog-archive-sidebar"' "$page"; then
    echo "Archive layout check failed: sidebar missing from $page" >&2
    exit 1
  fi
done

echo "Archive layout check passed: versioned CSS, sidebar, and five summaries are present."
