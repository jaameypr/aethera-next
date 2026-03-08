#!/bin/sh
set -e

# Ensure aethera data directories exist and are owned by nextjs
for dir in \
  "${AETHERA_DATA_DIR:-/app/.aethera/run}" \
  "${AETHERA_BACKUP_DIR:-/app/.aethera/backup}" \
  "${AETHERA_WORLD_UPLOAD_DIR:-/app/.aethera/world_upload}"; do
  mkdir -p "$dir"
  chown -R 1001:1001 "$dir"
done

# Drop privileges and exec the main process
exec su-exec nextjs "$@"
