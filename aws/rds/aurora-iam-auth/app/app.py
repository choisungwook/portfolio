# /// script
# requires-python = ">=3.12"
# dependencies = ["pymysql==1.2.3", "boto3==1.43.126"]
# ///
"""Aurora MySQL을 조회하는 실습용 API 서버.

DB 인증 방식(password | iam)은 SSM Parameter Store 값을 5초마다 읽어 정한다.
요청마다 새 연결을 맺으므로 스위치를 바꾸면 다음 요청부터 새 방식으로 인증한다.
"""
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import boto3
import pymysql

REGION = os.environ["AWS_REGION"]
DB_HOST = os.environ["DB_HOST"]
DB_NAME = os.environ["DB_NAME"]
DB_PORT = 3306
CA_PATH = os.environ["CA_PATH"]
USERS = {"password": os.environ["PW_USER"], "iam": os.environ["IAM_USER"]}
MODE_TTL_SECONDS = 5
PASSWORD_TTL_SECONDS = 60
TOKEN_TTL_SECONDS = 600  # token 수명은 15분. 만료 전에 새로 만든다.

ssm = boto3.client("ssm", region_name=REGION)
rds = boto3.client("rds", region_name=REGION)
_cache: dict[str, tuple[float, str]] = {}


def cached(key: str, ttl: int, load) -> str:
  """ttl초 동안 load() 결과를 재사용한다."""
  now = time.time()
  hit = _cache.get(key)
  if hit and now - hit[0] < ttl:
    return hit[1]
  value = load()
  _cache[key] = (now, value)
  return value


def read_param(name: str, decrypt: bool = False) -> str:
  """SSM parameter 값을 읽는다."""
  return ssm.get_parameter(Name=name, WithDecryption=decrypt)["Parameter"]["Value"]


def auth_mode() -> str:
  """현재 인증 방식 스위치 값(password | iam)."""
  return cached("mode", MODE_TTL_SECONDS, lambda: read_param(os.environ["MODE_PARAM"]))


def db_secret(mode: str) -> str:
  """인증 방식에 맞는 비밀번호 또는 IAM 인증 token."""
  if mode == "iam":
    return cached("token", TOKEN_TTL_SECONDS, lambda: rds.generate_db_auth_token(
      DBHostname=DB_HOST, Port=DB_PORT, DBUsername=USERS["iam"], Region=REGION))
  return cached("password", PASSWORD_TTL_SECONDS,
                lambda: read_param(os.environ["PASSWORD_PARAM"], decrypt=True))


def query_items(mode: str) -> dict:
  """새 연결을 맺어 items를 조회하고 접속한 DB 사용자를 함께 돌려준다."""
  started = time.perf_counter()
  conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=USERS[mode], password=db_secret(mode),
                         database=DB_NAME, ssl={"ca": CA_PATH}, connect_timeout=3)
  connect_ms = round((time.perf_counter() - started) * 1000, 1)
  with conn, conn.cursor() as cur:
    cur.execute("SELECT CURRENT_USER(), COUNT(*) FROM items")
    current_user, count = cur.fetchone()
  return {"mode": mode, "db_user": current_user, "items": count, "connect_ms": connect_ms}


class Handler(BaseHTTPRequestHandler):
  """/healthz, /readyz, /api/items 세 경로만 처리한다."""

  def do_GET(self) -> None:
    if self.path == "/healthz":
      return self.reply(200, {"status": "ok"})
    if self.path in ("/api/items", "/readyz"):
      return self.items()
    self.reply(404, {"error": "not found"})

  def items(self) -> None:
    mode = auth_mode()
    try:
      self.reply(200, query_items(mode))
    except Exception as e:
      self.reply(500, {"mode": mode, "error": str(e)})

  def reply(self, status: int, body: dict) -> None:
    data = json.dumps(body).encode()
    self.send_response(status)
    self.send_header("Content-Type", "application/json")
    self.send_header("Content-Length", str(len(data)))
    self.end_headers()
    self.wfile.write(data)

  def log_message(self, fmt: str, *args) -> None:
    print(json.dumps({"path": self.path, "status": args[1] if len(args) > 1 else None}), flush=True)


if __name__ == "__main__":
  ThreadingHTTPServer(("0.0.0.0", int(os.environ["APP_PORT"])), Handler).serve_forever()
