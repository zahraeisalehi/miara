#!/usr/bin/env bash
# Fetch the official Liara CLI source (MIT, github.com/liara-cloud/cli) at a pinned commit.
# It is the second source of API truth (see docs/DECISIONS.md D16) and is gitignored, so run this after cloning.
set -euo pipefail

REPO_URL="https://github.com/liara-cloud/cli"
PINNED_SHA="14ec35f79d703a09a5e3abbb22ba59239cdde80d"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${ROOT_DIR}/docs/vendor/liara-cli"

if [[ -d "${TARGET_DIR}/.git" ]]; then
  current="$(git -C "${TARGET_DIR}" rev-parse HEAD)"
  if [[ "${current}" != "${PINNED_SHA}" ]]; then
    git -C "${TARGET_DIR}" fetch --quiet origin
    git -C "${TARGET_DIR}" -c advice.detachedHead=false checkout --quiet "${PINNED_SHA}"
  fi
elif [[ -e "${TARGET_DIR}" ]]; then
  echo "error: ${TARGET_DIR} exists but is not a git checkout; move it away and re-run" >&2
  exit 1
else
  git clone --quiet "${REPO_URL}" "${TARGET_DIR}"
  git -C "${TARGET_DIR}" -c advice.detachedHead=false checkout --quiet "${PINNED_SHA}"
fi

echo "liara-cli at $(git -C "${TARGET_DIR}" rev-parse HEAD)"
