#!/bin/sh
set -eu

TEMPLATE=/home/kong/temp.yml
OUTPUT=/usr/local/kong/kong.yml

envsubst '
  ${ANON_KEY}
  ${SERVICE_ROLE_KEY}
  ${DASHBOARD_USERNAME}
  ${DASHBOARD_PASSWORD}
' < "$TEMPLATE" > "$OUTPUT"

exec /docker-entrypoint.sh kong docker-start
