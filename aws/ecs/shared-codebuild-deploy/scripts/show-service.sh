#!/usr/bin/env bash
set -euo pipefail

service=${1:?Usage: show-service.sh hello-alpha|hello-beta}
case "$service" in
  hello-alpha|hello-beta) ;;
  *) echo 'Unknown lab service' >&2; exit 1 ;;
esac

lab_directory=$(cd "$(dirname "$0")/.." && pwd)
foundation=$(terraform -chdir="$lab_directory/foundation" output -json lab)
region=$(jq -r '.aws_region' <<< "$foundation")
cluster=$(jq -r '.cluster_name' <<< "$foundation")
service_json=$(aws ecs describe-services --cluster "$cluster" --services "$service" --region "$region" --output json)
jq -e '.failures | length == 0' <<< "$service_json" > /dev/null
task_definition=$(jq -er '.services[0].taskDefinition' <<< "$service_json")
jq '.services[0] | {serviceName, taskDefinition, desiredCount, runningCount, pendingCount, deployments}' <<< "$service_json"
aws ecs describe-task-definition --task-definition "$task_definition" --include TAGS --region "$region" --output json |
  jq '{app_version: ([.tags[]? | select(.key == "app_version") | .value][0])} + (.taskDefinition | {taskDefinitionArn, cpu, memory,
    containerDefinitions: [.containerDefinitions[] | {name, image, environment}]})'

task_list=$(aws ecs list-tasks --cluster "$cluster" --service-name "$service" --desired-status RUNNING --region "$region" --output json)
read -r -a task_arns <<< "$(jq -r '.taskArns | join(" ")' <<< "$task_list")"
if [[ ${#task_arns[@]} -eq 0 ]]; then
  echo 'No RUNNING tasks' >&2
  exit 1
fi
tasks=$(aws ecs describe-tasks --cluster "$cluster" --tasks "${task_arns[@]}" --region "$region" --output json)
jq -e '.failures | length == 0' <<< "$tasks" > /dev/null
jq '.tasks[] | {taskArn, taskDefinitionArn, cpu, memory, healthStatus, containers: [.containers[] | {name, image, imageDigest}]}' <<< "$tasks"
eni_ids=$(jq -r --arg arn "$task_definition" \
  '.tasks[] | select(.taskDefinitionArn == $arn) | .attachments[].details[] | select(.name == "networkInterfaceId") | .value' <<< "$tasks")
if [[ -z "$eni_ids" ]]; then
  echo 'No ENI for the current task definition' >&2
  exit 1
fi
for eni in $eni_ids; do
  public_ip=$(aws ec2 describe-network-interfaces --network-interface-ids "$eni" --region "$region" \
    --query 'NetworkInterfaces[0].Association.PublicIp' --output text)
  [[ "$public_ip" != None ]] || { echo 'No public IP' >&2; exit 1; }
  echo "GET http://$public_ip:8080/"
  curl --fail --silent --show-error --connect-timeout 5 --max-time 10 "http://$public_ip:8080/"
  printf '\n'
  curl --fail --silent --show-error --connect-timeout 5 --max-time 10 "http://$public_ip:8080/health"
  printf '\n'
done
