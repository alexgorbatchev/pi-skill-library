#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/set-tsx-node-options.sh"

oxfmt -c oxfmt.config.ts --write "src/**/*.ts" package.json tsconfig.json oxfmt.config.ts oxlint.config.ts
