# /// script
# requires-python = ">=3.12"
# dependencies = ["boto3>=1.42.2"]
# ///
"""AgentCore Runtime 상태 조회와 InvokeAgentRuntime 호출 시간 측정.

runtime ARN은 환경 변수 RUNTIME_<이름>_ARN에서 읽는다(.runtime.env).
사용 예: uv run --env-file .runtime.env scripts/runtime.py cold --runtime v2 --count 5
"""

import argparse
import json
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from functools import cache

import boto3
from botocore.config import Config

RUNTIMES = ["legacy", "v2", "default"]


@cache
def client(service: str):
  """AWS_REGION 리전의 boto3 client를 한 번만 만들어 재사용한다. client는 thread-safe다."""
  return boto3.client(
    service,
    region_name=os.environ["AWS_REGION"],
    config=Config(max_pool_connections=64, read_timeout=120),
  )


def runtime_arn(name: str) -> str:
  """runtime 이름에 해당하는 ARN을 환경 변수에서 읽는다."""
  return os.environ[f"RUNTIME_{name.upper()}_ARN"]


def new_session_id() -> str:
  """runtimeSessionId는 33자 이상이어야 하므로 uuid4 hex(32자)에 접두사를 붙인다."""
  return f"s-{uuid.uuid4().hex}"


def invoke(name: str, session_id: str, payload: dict) -> tuple[float, dict]:
  """InvokeAgentRuntime을 호출하고 (응답까지 걸린 초, 응답 JSON)을 돌려준다."""
  started = time.perf_counter()
  response = client("bedrock-agentcore").invoke_agent_runtime(
    agentRuntimeArn=runtime_arn(name),
    runtimeSessionId=session_id,
    qualifier="DEFAULT",
    contentType="application/json",
    accept="application/json",
    payload=json.dumps(payload).encode(),
  )
  body = json.loads(response["response"].read())
  return round(time.perf_counter() - started, 2), body


def status(_: argparse.Namespace) -> None:
  """GetAgentRuntime으로 runtime마다 platformVersion, status, version을 출력한다."""
  control = client("bedrock-agentcore-control")
  print(f"{'runtime':<8} {'platformVersion':<16} {'status':<10} version")
  for name in RUNTIMES:
    runtime_id = runtime_arn(name).split("/")[-1]
    got = control.get_agent_runtime(agentRuntimeId=runtime_id)
    print(f"{name:<8} {got.get('platformVersion', '-'):<16} {got['status']:<10} {got['agentRuntimeVersion']}")


def print_row(index: int, seconds: float, body: dict) -> None:
  """측정 결과 한 줄을 출력한다."""
  print(
    f"{index:<3} {seconds:>7} {body['init_uuid'][:8]:<9} {body['request_uuid'][:8]:<9} "
    f"{body['init_random']:<7.4f} {body['wall_since_init']:>8} {body['monotonic_since_init']:>8} "
    f"{body['hostname']:<10} {body['pid']:<4} {body['turns']:<5} {body['rss_mb']}"
  )


def measure(args: argparse.Namespace) -> None:
  """cold는 매번 새 session, warm은 같은 session으로 count번 호출한다."""
  session_id = new_session_id()
  print("#   seconds init_id   req_id    init_rnd wall_init mono_init hostname   pid  turns rss_mb")
  for index in range(1, args.count + 1):
    if args.mode == "cold":
      session_id = new_session_id()
    seconds, body = invoke(args.runtime, session_id, {"action": "info"})
    print_row(index, seconds, body)


def percentile(values: list[float], ratio: float) -> float:
  """정렬된 값에서 nearest-rank 방식으로 백분위수를 고른다."""
  return values[max(0, round(ratio * len(values)) - 1)]


def burst(args: argparse.Namespace) -> None:
  """새 session count개를 동시에 호출하고 지연 분포를 출력한다."""
  def one(_: int) -> float:
    return invoke(args.runtime, new_session_id(), {"action": "info"})[0]

  with ThreadPoolExecutor(max_workers=args.count) as pool:
    seconds = sorted(pool.map(one, range(args.count)))
  print(f"runtime={args.runtime} sessions={args.count}")
  print(f"p50={percentile(seconds, 0.5)} p75={percentile(seconds, 0.75)} max={seconds[-1]}")
  print("all:", seconds)


def step(name: str, session_id: str, payload: dict, wait_seconds: int) -> None:
  """action 하나를 보내고 시각과 RSS를 출력한 뒤 wait_seconds만큼 기다린다."""
  _, body = invoke(name, session_id, payload)
  stamp = time.strftime("%H:%M:%S", time.gmtime())
  print(f"{stamp}Z {payload['action']:<5} rss_mb={body['rss_mb']} then wait {wait_seconds}s", flush=True)
  time.sleep(wait_seconds)


def memory(args: argparse.Namespace) -> None:
  """session 하나에서 대기 → 메모리 확보 → 해제 → 대기 순서로 사용량을 바꾼 뒤 session을 끝낸다."""
  session_id = new_session_id()
  print(f"runtime={args.runtime} session={session_id}")
  step(args.runtime, session_id, {"action": "info"}, args.phase)
  step(args.runtime, session_id, {"action": "alloc", "mb": args.mb}, args.phase)
  step(args.runtime, session_id, {"action": "free"}, args.phase)
  step(args.runtime, session_id, {"action": "info"}, 0)
  client("bedrock-agentcore").stop_runtime_session(
    agentRuntimeArn=runtime_arn(args.runtime), runtimeSessionId=session_id, qualifier="DEFAULT"
  )
  print(f"{time.strftime('%H:%M:%S', time.gmtime())}Z StopRuntimeSession")


def usage_records(log_group: str, session_id: str) -> list[dict]:
  """USAGE_LOGS에서 session 하나의 1초 단위 레코드를 시간순으로 모은다."""
  paginator = client("logs").get_paginator("filter_log_events")
  pages = paginator.paginate(logGroupName=log_group, filterPattern=f'"{session_id}"')
  records = [json.loads(event["message"]) for page in pages for event in page["events"]]
  return sorted(records, key=lambda record: record["event_timestamp"])


def usage(args: argparse.Namespace) -> None:
  """1초 레코드를 bucket초 단위로 묶어 평균 사용 메모리(GB)와 vCPU, 누적 사용량을 출력한다."""
  records = usage_records(args.log_group, args.session)
  buckets: dict[int, list[dict]] = {}
  for record in records:
    buckets.setdefault(record["event_timestamp"] // 1000 // args.bucket, []).append(record["metrics"])
  print(f"{'start(UTC)':<10} {'sec':>4} {'avg_GB':>7} {'avg_vCPU':>8}")
  for key, metrics in sorted(buckets.items()):
    gb = sum(m["agent.runtime.memory.gb_hours.used"] for m in metrics) * 3600 / len(metrics)
    vcpu = sum(m["agent.runtime.vcpu.hours.used"] for m in metrics) * 3600 / len(metrics)
    print(f"{time.strftime('%H:%M:%S', time.gmtime(key * args.bucket)):<10} {len(metrics):>4} {gb:>7.3f} {vcpu:>8.3f}")
  total_gb_hours = sum(r["metrics"]["agent.runtime.memory.gb_hours.used"] for r in records)
  total_vcpu_hours = sum(r["metrics"]["agent.runtime.vcpu.hours.used"] for r in records)
  print(f"records={len(records)} memory_gb_hours={total_gb_hours:.5f} vcpu_hours={total_vcpu_hours:.5f}")


def call(args: argparse.Namespace) -> None:
  """지정한 session에 action 하나를 보내고 응답을 그대로 출력한다."""
  session_id = args.session or new_session_id()
  seconds, body = invoke(args.runtime, session_id, {"action": args.action, "mb": args.mb})
  print(json.dumps({"session": session_id, "seconds": seconds, **body}, indent=2))


def parse_args() -> argparse.Namespace:
  """subcommand: status, cold, warm, burst, memory, usage, call."""
  parser = argparse.ArgumentParser()
  sub = parser.add_subparsers(dest="command", required=True)
  sub.add_parser("status").set_defaults(func=status)
  for mode in ["cold", "warm"]:
    timing = sub.add_parser(mode)
    timing.add_argument("--runtime", choices=RUNTIMES, required=True)
    timing.add_argument("--count", type=int, default=5)
    timing.set_defaults(func=measure, mode=mode)
  concurrent = sub.add_parser("burst")
  concurrent.add_argument("--runtime", choices=RUNTIMES, required=True)
  concurrent.add_argument("--count", type=int, default=20)
  concurrent.set_defaults(func=burst)
  timeline = sub.add_parser("memory")
  timeline.add_argument("--runtime", choices=RUNTIMES, required=True)
  timeline.add_argument("--mb", type=int, default=2048)
  timeline.add_argument("--phase", type=int, default=120)
  timeline.set_defaults(func=memory)
  report = sub.add_parser("usage")
  report.add_argument("--session", required=True)
  report.add_argument("--log-group", default=os.environ.get("USAGE_LOG_GROUP"))
  report.add_argument("--bucket", type=int, default=30)
  report.set_defaults(func=usage)
  single = sub.add_parser("call")
  single.add_argument("--runtime", choices=RUNTIMES, required=True)
  single.add_argument("--session")
  single.add_argument("--action", choices=["info", "alloc", "free"], default="info")
  single.add_argument("--mb", type=int, default=512)
  single.set_defaults(func=call)
  return parser.parse_args()


if __name__ == "__main__":
  arguments = parse_args()
  arguments.func(arguments)
