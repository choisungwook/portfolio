#!/bin/sh
set -eu

if [ "${CLASS_LOADING_LOG_ENABLED:-false}" = "true" ]; then
  exec java "-Xlog:class+load=info" -jar app.jar
fi

exec java -jar app.jar
