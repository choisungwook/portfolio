# /// script
# requires-python = ">=3.12"
# dependencies = ["pymysql==1.2.3", "boto3==1.43.126"]
# ///
"""기존 password 사용자를 ALTER USER로 IAM 인증으로 바꾸면 무엇이 끊기는지 재는 실험.

- 0.5초마다 새 연결을 password로 맺는다(배포 전 애플리케이션).
- 이미 맺어 둔 세션 하나로 같은 주기에 쿼리를 보낸다(커넥션 풀의 기존 연결).
- ALTER_AT초에 관리자가 사용자를 IAM 인증으로 바꾸고, SWITCH_AT초에 클라이언트가 token으로 바꾼다(재배포).

실행: uv run scripts/inplace_alter_demo.py <cluster endpoint> <master secret arn> <ca 파일>
"""
import json
import sys
import time

import boto3
import pymysql

HOST, SECRET_ARN, CA = sys.argv[1], sys.argv[2], sys.argv[3]
USER, DB = "legacy_app", "labdb"
ALTER_AT, SWITCH_AT, END_AT, TICK = 5, 15, 20, 0.5
session = boto3.Session()


def connect(user: str, password: str, cleartext: bool = False) -> pymysql.Connection:
  """TLS로 새 연결을 맺는다. IAM token은 cleartext 플러그인으로 보낸다."""
  extra = {"auth_plugin_map": {"mysql_clear_password": None}} if cleartext else {}
  return pymysql.connect(host=HOST, user=user, password=password, database=DB,
                         ssl={"ca": CA}, connect_timeout=3, **extra)


def admin(sql: str) -> None:
  """master 사용자로 SQL 한 줄을 실행한다."""
  secret = json.loads(session.client("secretsmanager").get_secret_value(SecretId=SECRET_ARN)["SecretString"])
  with connect("admin", secret["password"]) as conn, conn.cursor() as cur:
    cur.execute(sql)


def try_new_connection(use_token: bool) -> str:
  """새 연결을 맺어 결과를 'ok' 또는 오류 코드로 돌려준다."""
  try:
    if use_token:
      token = session.client("rds").generate_db_auth_token(HOST, 3306, USER)
      connect(USER, token, cleartext=True).close()
    else:
      connect(USER, "Legacy-pass-123").close()
    return "ok"
  except pymysql.MySQLError as e:
    return f"ERR {e.args[0]}"


def try_existing(conn: pymysql.Connection) -> str:
  """ALTER 전에 맺어 둔 세션이 아직 쿼리를 처리하는지 본다."""
  try:
    with conn.cursor() as cur:
      cur.execute("SELECT CURRENT_USER()")
      return "ok"
  except pymysql.MySQLError as e:
    return f"ERR {e.args[0]}"


def main() -> None:
  admin(f"DROP USER IF EXISTS '{USER}'@'%'")
  admin(f"CREATE USER '{USER}'@'%' IDENTIFIED BY 'Legacy-pass-123' REQUIRE SSL")
  admin(f"GRANT SELECT ON {DB}.* TO '{USER}'@'%'")
  existing = connect(USER, "Legacy-pass-123")
  start, altered = time.time(), False
  while (t := time.time() - start) < END_AT:
    if t >= ALTER_AT and not altered:
      admin(f"ALTER USER '{USER}'@'%' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS'")
      altered = True
      print(f"{t:5.1f}s  --- ALTER USER 실행 ---")
    use_token = t >= SWITCH_AT
    print(f"{t:5.1f}s  new({'token' if use_token else 'password'})={try_new_connection(use_token):9}"
          f" existing_session={try_existing(existing)}")
    time.sleep(TICK)
  admin(f"DROP USER '{USER}'@'%'")


if __name__ == "__main__":
  main()
