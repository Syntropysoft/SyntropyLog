#!/bin/sh
# Remove build artifacts and dependencies (run from repo root).
find . \( -type d -name "dist" -o -type d -name "coverage" -o -type d -name "node_modules" -o -type f -name "package-lock.json" \) -exec rm -rf {} +
