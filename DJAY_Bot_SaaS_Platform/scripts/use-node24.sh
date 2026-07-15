#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_DIR="$ROOT_DIR/../FlowBot_V1_App/.node/node-v24.18.0-linux-x64/bin"

if [ ! -x "$NODE_DIR/node" ]; then
  echo "Node v24.18.0 is not installed at $NODE_DIR." >&2
  exit 1
fi

PATH="$NODE_DIR:$PATH" "$@"

