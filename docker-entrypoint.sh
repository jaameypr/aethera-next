#!/bin/sh
set -e

# Ensure aethera data directories exist
for dir in \
  "${AETHERA_DATA_DIR:-/app/.aethera/run}" \
  "${AETHERA_BACKUP_DIR:-/app/.aethera/backup}" \
  "${AETHERA_WORLD_UPLOAD_DIR:-/app/.aethera/world_upload}"; do
  mkdir -p "$dir"
done

# Provide the backup worker script path to the Node.js process.
# The worker is spawned via exec() at runtime; this env var prevents
# any build-time path resolution by Turbopack.
export AETHERA_WORKER_SCRIPT="${AETHERA_WORKER_SCRIPT:-/app/scripts/backup-worker.js}"

exec "$@"
