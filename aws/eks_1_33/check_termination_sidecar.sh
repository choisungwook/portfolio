#!/bin/bash
set -euo pipefail

while true; do
  kubectl get pod sidecar-in-containers -oyaml | \
  yq e '{
    "pod": .metadata.name,
    "sidecar_times": (
      .status.containerStatuses[] | select(.name == "sidecar") | .state.terminated |
      {"started_at": .startedAt, "finished_at": .finishedAt}
    ),
    "nginx_times": (
      .status.containerStatuses[] | select(.name == "nginx") | .state.terminated |
      {"started_at": .startedAt, "finished_at": .finishedAt}
    )
  }' -
  sleep 0.1
  echo
done
