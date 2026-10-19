"""ECS blue/green lifecycle hook.

POST_TEST_TRAFFIC_SHIFT 단계에서 ECS가 호출한다. 이 시점에 test listener(8080)는
green 서비스 리비전을 가리키므로, 거기로 /health 를 호출해 green이 정상인지 확인한다.
SUCCEEDED를 돌려주면 production 트래픽이 green으로 넘어가고, FAILED를 돌려주면
ECS가 blue로 롤백한다.
"""

import json
import os
import urllib.error
import urllib.request

import boto3

TEST_URL = os.environ["TEST_URL"]
TIMEOUT_SECONDS = 5

ecs = boto3.client("ecs")


def handler(event, context):
  print(json.dumps(event))
  details = event.get("executionDetails", {})

  if is_first_deployment(details.get("serviceArn")):
    print("first deployment of the service, nothing to compare against: SUCCEEDED")
    return {"hookStatus": "SUCCEEDED"}

  try:
    with urllib.request.urlopen(TEST_URL, timeout=TIMEOUT_SECONDS) as res:
      body = res.read().decode()
      print(f"GET {TEST_URL} -> {res.status} {body.strip()}")
      return {"hookStatus": "SUCCEEDED"}
  except urllib.error.HTTPError as e:
    print(f"GET {TEST_URL} -> {e.code}: FAILED")
  except Exception as e:
    print(f"GET {TEST_URL} raised {e!r}: FAILED")

  return {"hookStatus": "FAILED"}


def is_first_deployment(service_arn):
  """create-service도 같은 lifecycle을 타므로, 비교 대상 blue가 없는 첫 배포는 통과시킨다."""
  if not service_arn:
    return False
  deployments = ecs.list_service_deployments(service=service_arn)["serviceDeployments"]
  return len(deployments) <= 1
