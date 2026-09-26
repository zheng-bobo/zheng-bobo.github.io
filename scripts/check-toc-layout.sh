#!/usr/bin/env bash

set -euo pipefail

source_css="static/css/readability.css"
built_css="docs/css/readability.css"

for css_file in "$source_css" "$built_css"; do
  rg -qF 'position: fixed !important;' "$css_file"
  rg -qF 'top: 20px !important;' "$css_file"
done

echo "TOC layout check passed: desktop table of contents stays fixed."
