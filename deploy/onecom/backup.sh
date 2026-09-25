#!/usr/bin/env sh
set -eu
set -o pipefail

cd "$(dirname "$0")/../.."
mkdir -p backups
stamp="$(date -u +%Y-%m-%d_%H-%M-%S)"

docker compose --env-file .env.onecom -f compose.onecom.yml exec -T database \
  sh -c 'exec mysqldump --single-transaction --quick --lock-tables=false -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip > "backups/innovcare-$stamp.sql.gz"

find backups -type f -name 'innovcare-*.sql.gz' -mtime +30 -delete
echo "Sauvegarde créée : backups/innovcare-$stamp.sql.gz"
