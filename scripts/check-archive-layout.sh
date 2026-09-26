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

  if grep -Eq '最新 5 篇文章|Five latest posts|阅读近期文章的摘要|Read a short preview' "$page"; then
    echo "Archive layout check failed: removed intro header still appears in $page" >&2
    exit 1
  fi

  if ! grep -q 'class="blog-summary-excerpt post"' "$page"; then
    echo "Archive layout check failed: rich summary wrapper missing from $page" >&2
    exit 1
  fi
done

if ! grep -q 'class="language-text"' docs/post/index.html; then
  echo "Archive layout check failed: Transformer code block missing from Chinese summary" >&2
  exit 1
fi

if ! grep -q 'class="language-text"' docs/en/post/index.html; then
  echo "Archive layout check failed: Transformer code block missing from English summary" >&2
  exit 1
fi

echo "Archive layout check passed: intro removed; rich summaries, code blocks, sidebar, and five posts are present."
