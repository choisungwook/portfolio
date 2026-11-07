"""EventBridge Scheduler가 1분마다 실행하는 클라이언트 트래픽 생성기.

실행 한 번에 약 55초 동안 INTERVAL_SECONDS 간격으로 app API를 호출하고,
요청마다 결과를 CloudWatch Embedded Metric Format(EMF) 로그로 남긴다.
EMF 로그는 CloudWatch가 metric으로 바꾸므로 PutMetricData 권한이 필요 없다.
"""
import json
import os
import time
import urllib.error
import urllib.request

TARGET_URL = os.environ["TARGET_URL"]
INTERVAL_SECONDS = float(os.environ.get("INTERVAL_SECONDS", "1"))
NAMESPACE = os.environ["METRIC_NAMESPACE"]
STOP_BEFORE_MS = 4000


def call_api() -> tuple[int, dict]:
  """API를 한 번 호출해 (HTTP status, body)를 돌려준다. 연결 실패는 status 0."""
  try:
    with urllib.request.urlopen(TARGET_URL, timeout=3) as res:
      return res.status, json.loads(res.read())
  except urllib.error.HTTPError as e:
    return e.code, json.loads(e.read() or b"{}")
  except Exception as e:
    return 0, {"error": str(e)}


def emit(status: int, body: dict, latency_ms: float) -> None:
  """요청 하나를 EMF 로그 한 줄로 남긴다. AuthMode별 metric과 전체 metric이 함께 생긴다."""
  ok = status == 200
  print(json.dumps({
    "_aws": {
      "Timestamp": int(time.time() * 1000),
      "CloudWatchMetrics": [{
        "Namespace": NAMESPACE,
        "Dimensions": [["AuthMode"], []],
        "Metrics": [{"Name": "Success", "Unit": "Count"}, {"Name": "Error", "Unit": "Count"},
                    {"Name": "LatencyMs", "Unit": "Milliseconds"}],
      }],
    },
    "AuthMode": body.get("mode", "unknown"),
    "Success": int(ok), "Error": int(not ok), "LatencyMs": latency_ms,
    "status": status, "db_user": body.get("db_user"), "error": body.get("error"),
  }))


def handler(event, context) -> dict:
  """남은 실행 시간이 STOP_BEFORE_MS보다 많은 동안 API를 반복 호출한다."""
  sent = failed = 0
  while context.get_remaining_time_in_millis() > STOP_BEFORE_MS:
    started = time.perf_counter()
    status, body = call_api()
    latency_ms = round((time.perf_counter() - started) * 1000, 1)
    emit(status, body, latency_ms)
    sent, failed = sent + 1, failed + int(status != 200)
    time.sleep(max(0.0, INTERVAL_SECONDS - (time.perf_counter() - started)))
  return {"sent": sent, "failed": failed}
