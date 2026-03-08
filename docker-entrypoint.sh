#!/bin/sh
set -e

# Ensure aethera data directories exist
for dir in \
  "${AETHERA_DATA_DIR:-/app/.aethera/run}" \
  "${AETHERA_BACKUP_DIR:-/app/.aethera/backup}" \
  "${AETHERA_WORLD_UPLOAD_DIR:-/app/.aethera/world_upload}"; do
  mkdir -p "$dir"
done

exec "$@"
