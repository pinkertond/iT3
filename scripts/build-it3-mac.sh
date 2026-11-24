#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
node_bin=".t3/toolchain/node-v$(node -p "require('./package.json').engines.node")-darwin-arm64/bin"
export PATH="$PWD/$node_bin:$PWD/node_modules/.bin:$PATH"
node -e 'const v = require("./package.json").engines.node; if (process.versions.node !== v) throw Error("Use Node " + v)'
version=$(cat IT3_VERSION)
exec node scripts/build-desktop-artifact.ts --platform mac --target dmg --arch arm64 --build-version "$version" "$@"
