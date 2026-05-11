import psycopg2

DB_CONFIG = {
  "host": "localhost",
  "port": 5432,
  "dbname": "testdb",
  "user": "testuser",
  "password": "testpass",
}


def get_connection():
  return psycopg2.connect(**DB_CONFIG)


def show_all_accounts(conn):
  print("\n=== 전체 계좌 조회 ===")
  with conn.cursor() as cur:
    cur.execute("SELECT id, name, balance FROM accounts ORDER BY id")
    for row in cur.fetchall():
      print(f"  id={row[0]}, name={row[1]}, balance={row[2]}")


def call_deposit(conn, account_id, amount):
  print(f"\n=== 입금: 계좌 {account_id}에 {amount}원 ===")
  with conn.cursor() as cur:
    cur.execute("CALL deposit(%s, %s)", (account_id, amount))
  conn.commit()
  print("  입금 완료")


def call_withdraw(conn, account_id, amount):
  print(f"\n=== 출금: 계좌 {account_id}에서 {amount}원 ===")
  with conn.cursor() as cur:
    cur.execute("CALL withdraw(%s, %s)", (account_id, amount))
  conn.commit()
  print("  출금 완료")


def call_transfer(conn, from_id, to_id, amount):
  print(f"\n=== 이체: 계좌 {from_id} -> 계좌 {to_id}, {amount}원 ===")
  with conn.cursor() as cur:
    cur.execute("CALL transfer(%s, %s, %s)", (from_id, to_id, amount))
  conn.commit()
  print("  이체 완료")


def call_get_balance(conn, account_id):
  print(f"\n=== 잔액 조회: 계좌 {account_id} ===")
  with conn.cursor() as cur:
    cur.execute("SELECT get_balance(%s)", (account_id,))
    balance = cur.fetchone()[0]
    print(f"  잔액: {balance}원")
  return balance


def call_withdraw_insufficient(conn, account_id, amount):
  print(f"\n=== 잔액 부족 테스트: 계좌 {account_id}에서 {amount}원 출금 시도 ===")
  try:
    with conn.cursor() as cur:
      cur.execute("CALL withdraw(%s, %s)", (account_id, amount))
    conn.commit()
  except psycopg2.errors.RaiseException as e:
    conn.rollback()
    print(f"  예상된 에러 발생: {e.pgerror.strip()}")


def main():
  conn = get_connection()

  try:
    print("=" * 50)
    print(" DB 프로시저 핸즈온")
    print("=" * 50)

    # 1. 초기 상태 확인
    show_all_accounts(conn)

    # 2. 입금 프로시저 호출
    call_deposit(conn, 1, 5000)
    show_all_accounts(conn)

    # 3. 출금 프로시저 호출
    call_withdraw(conn, 2, 2000)
    show_all_accounts(conn)

    # 4. 이체 프로시저 호출
    call_transfer(conn, 1, 3, 3000)
    show_all_accounts(conn)

    # 5. 함수로 잔액 조회
    call_get_balance(conn, 1)

    # 6. 잔액 부족 에러 테스트
    call_withdraw_insufficient(conn, 3, 999999)

  finally:
    conn.close()
    print("\n연결 종료")


if __name__ == "__main__":
  main()
