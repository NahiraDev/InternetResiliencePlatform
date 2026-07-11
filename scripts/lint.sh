#!/usr/bin/env bash
set -euo pipefail

echo "Running Phase 0 repository lint checks..."

required_files=(
  "README.md"
  "LICENSE"
  "CONTRIBUTING.md"
  "SECURITY.md"
  "CODEOWNERS"
  "CHANGELOG.md"
  ".github/workflows/ci.yml"
  ".github/workflows/lint.yml"
  "docs/adr/0001-repository-architecture.md"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
done

echo "Lint placeholders passed."
