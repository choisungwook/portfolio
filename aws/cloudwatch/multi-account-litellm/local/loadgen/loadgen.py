"""계정별 LiteLLM에 team·key·model을 섞어 요청을 보내는 부하 생성기.

표준 라이브러리만 쓴다. 기동하면 team과 virtual key를 만들고(이미 있으면 건너뜀),
이후 INTERVAL_SECONDS마다 임의의 key와 model로 chat completion을 한 번 보낸다.
"""

import json
import os
import random
import socket
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

TEAMS = {
  "search": ["search-api", "search-batch"],
  "support": ["support-bot"],
  "data": ["data-notebook"],
}
MODELS = ["gpt-4o", "gpt-4o-mini", "claude-sonnet"]


@dataclass(frozen=True)
class Target:
  """부하를 보낼 계정 하나. host는 replica가 여러 개면 A 레코드가 여러 개인 이름이다."""

  account: str
  host: str
  port: int


def parse_targets(raw: str) -> list[Target]:
  """'dev=litellm-dev:4000,prod=litellm-prod:4000' 형식을 Target 목록으로 바꾼다."""
  targets = []
  for item in raw.split(","):
    account, address = item.split("=")
    host, port = address.split(":")
    targets.append(Target(account, host, int(port)))
  return targets


def pick_replica(target: Target) -> str:
  """A 레코드 중 하나를 임의로 골라 base URL을 만든다. ALB가 replica에 나눠 주는 동작을 흉내 낸다."""
  addresses = {info[4][0] for info in socket.getaddrinfo(target.host, target.port, socket.AF_INET)}
  return f"http://{random.choice(sorted(addresses))}:{target.port}"


def post(url: str, token: str, body: dict) -> int:
  """JSON POST를 보내고 HTTP status를 돌려준다.

  4xx·5xx는 그 status를, replica 교체 중 연결 실패는 0을 돌려준다. 부하 생성기가 멈추지 않게 한다.
  """
  request = urllib.request.Request(
    url,
    data=json.dumps(body).encode(),
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
  )
  try:
    with urllib.request.urlopen(request, timeout=10) as response:
      return response.status
  except urllib.error.HTTPError as error:
    return error.code
  except (urllib.error.URLError, OSError):
    return 0


def api_key(team_alias: str, key_alias: str) -> str:
  """lab에서 쓰는 고정 virtual key. LiteLLM은 16자 이상만 받는다."""
  return f"sk-{team_alias}-{key_alias}-lab-0001"


def ensure_keys(base_url: str, master_key: str) -> None:
  """team과 key를 만든다. 이미 있으면 LiteLLM이 4xx를 돌려주고 그대로 넘어간다."""
  for team_alias, key_aliases in TEAMS.items():
    post(f"{base_url}/team/new", master_key, {"team_id": f"team-{team_alias}", "team_alias": team_alias})
    for key_alias in key_aliases:
      body = {"team_id": f"team-{team_alias}", "key_alias": key_alias, "key": api_key(team_alias, key_alias)}
      post(f"{base_url}/key/generate", master_key, body)


def send_one(target: Target) -> int:
  """임의의 key와 model로 요청 하나를 보낸다. 5% 확률로 없는 model을 불러 실패 요청도 만든다."""
  team_alias = random.choice(list(TEAMS))
  key_alias = random.choice(TEAMS[team_alias])
  model = "not-exist-model" if random.random() < 0.05 else random.choice(MODELS)
  body = {"model": model, "messages": [{"role": "user", "content": "hello"}]}
  return post(f"{pick_replica(target)}/v1/chat/completions", api_key(team_alias, key_alias), body)


def wait_until_ready(target: Target) -> None:
  """proxy가 응답할 때까지 기다린다."""
  while True:
    try:
      urllib.request.urlopen(f"http://{target.host}:{target.port}/health/liveliness", timeout=3)
      return
    except (urllib.error.URLError, OSError):
      time.sleep(3)


def main() -> None:
  """모든 계정에 key를 준비하고 무한히 요청을 보낸다."""
  targets = parse_targets(os.environ["TARGETS"])
  master_key = os.environ["LITELLM_MASTER_KEY"]
  interval = float(os.environ.get("INTERVAL_SECONDS", "1"))
  for target in targets:
    wait_until_ready(target)
    ensure_keys(f"http://{target.host}:{target.port}", master_key)
  while True:
    target = random.choice(targets)
    print(f"{target.account} {send_one(target)}", flush=True)
    time.sleep(interval)


if __name__ == "__main__":
  main()
