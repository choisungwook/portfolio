#!/bin/bash

# Script to get the latest model URI from Kubeflow Model Registry
# Usage: ./get-latest-model.sh [model_name] [framework]

# Global constants
readonly NAMESPACE="kubeflow"
readonly MODEL_REGISTRY_BASE_URL="http://localhost:8080/api/model_registry/v1alpha3"

# Private function: Execute kubectl with model registry deployment
_exec_model_registry_curl() {
  local endpoint="$1"
  kubectl exec -n "$NAMESPACE" deployment/model-registry-deployment -- \
    curl -s "$MODEL_REGISTRY_BASE_URL/$endpoint"
}

# Private function: List available models
_list_available_models() {
  echo "Available models:"
  _exec_model_registry_curl "registered_models" | \
    jq -r '.items[] | "  - " + .name + " (ID: " + .id + ")"'
}

# Private function: Get model ID by name
_get_model_id() {
  local model_name="$1"
  local model_id

  model_id=$(_exec_model_registry_curl "registered_models" | \
    jq -r --arg name "$model_name" '.items[] | select(.name == $name) | .id')

  if [ -z "$model_id" ] || [ "$model_id" = "null" ]; then
    echo "Error: Model '$model_name' not found in registry" >&2
    _list_available_models
    return 1
  fi

  echo "$model_id"
}

# Private function: Get latest version ID
_get_latest_version_id() {
  local model_id="$1"
  local framework="$2"
  local version_id

  if [ -n "$framework" ]; then
    version_id=$(_exec_model_registry_curl "registered_models/$model_id/versions" | \
      jq -r --arg framework "$framework" \
      '.items | map(select(.description | contains($framework))) | sort_by(.createTimeSinceEpoch) | last | .id')
  else
    version_id=$(_exec_model_registry_curl "registered_models/$model_id/versions" | \
      jq -r '.items | sort_by(.createTimeSinceEpoch) | last | .id')
  fi

  if [ -z "$version_id" ] || [ "$version_id" = "null" ]; then
    echo "Error: No versions found for model ID '$model_id'" >&2
    return 1
  fi

  echo "$version_id"
}

# Private function: Get model artifact URI
_get_model_artifact_uri() {
  local version_id="$1"
  local model_uri

  model_uri=$(_exec_model_registry_curl "model_versions/$version_id/artifacts" | \
    jq -r '.items[0].uri')

  if [ -z "$model_uri" ] || [ "$model_uri" = "null" ]; then
    echo "Error: No artifact URI found for model version '$version_id'" >&2
    return 1
  fi

  echo "$model_uri"
}

# Public function: Get latest model URI
get_latest_model_uri() {
  local model_name="${1:-mnist}"
  local framework="${2:-}"
  local model_id version_id model_uri s3_uri

  # Display operation info
  if [ -n "$framework" ]; then
    echo "Getting latest model URI for: $model_name (framework: $framework)"
  else
    echo "Getting latest model URI for: $model_name"
  fi

  # Get model ID
  if ! model_id=$(_get_model_id "$model_name"); then
    return 1
  fi
  echo "Found model ID: $model_id"

  # Get latest version ID
  if ! version_id=$(_get_latest_version_id "$model_id" "$framework"); then
    return 1
  fi
  echo "Latest version ID: $version_id"

  # Get model artifact URI
  if ! model_uri=$(_get_model_artifact_uri "$version_id"); then
    return 1
  fi

  # Convert to S3 URI format
  s3_uri="${model_uri#/minio/}"

  # Display results
  echo ""
  echo "Latest model URI: $s3_uri"
  echo ""
  echo "Use this in your InferenceService:"
  echo "storageUri: \"$s3_uri\""

  return 0
}

# Main execution
main() {
  get_latest_model_uri "$@"
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
