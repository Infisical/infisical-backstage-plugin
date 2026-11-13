#!/usr/bin/env bash
# Publishes <plugin dir>/package.tgz to npm unless that exact version is already there,
# so a release that failed halfway can be re-run. Any other registry answer stops the release.
# Expects VERSION and NPM_TAG from the release workflow.
set -euo pipefail

dir="$1"
name=$(node -p "require('./$dir/package.json').name")

status=$(curl -sS --retry 3 -o /dev/null -w '%{http_code}' "https://registry.npmjs.org/$name/$VERSION")
case "$status" in
  200)
    echo "$name@$VERSION is already on npm, skipping"
    ;;
  404)
    npm publish "./$dir/package.tgz" --access public --tag "$NPM_TAG"
    ;;
  *)
    echo "::error::Could not check whether $name@$VERSION is on npm (HTTP $status)"
    exit 1
    ;;
esac
