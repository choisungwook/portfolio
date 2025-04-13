import mysql.connector
import os
from dotenv import load_dotenv
from contextlib import contextmanager
import logging
from fastapi import HTTPException


load_dotenv()
logging.basicConfig(level=logging.INFO)


db_config = {
  "host": os.getenv("DB_HOST"),
  "port": int(os.getenv("DB_PORT", 3306)),
  "user": os.getenv("DB_USER"),
  "password": os.getenv("DB_PASSWORD"),
  "database": os.getenv("DB_NAME"),
}


try:
  pool = mysql.connector.pooling.MySQLConnectionPool(
    pool_name="mypool",
    pool_size=5,
    **db_config,  # 필요에 따라 조절
  )
  logging.error("Database connection pool created successfully.")
except mysql.connector.Error as err:
  logging.error(f"Error creating connection pool: {err}")
  pool = None


@contextmanager
def get_db_connection():
  if pool is None:
    raise ConnectionError("Database connection pool is not available.")
  conn = None
  try:
    conn = pool.get_connection()
    yield conn
  except mysql.connector.Error as err:
    logging.error(f"Error getting connection from pool: {err}")
    raise  # 에러를 다시 발생시켜 호출자에게 알림
  finally:
    if conn and conn.is_connected():
      conn.close()


def execute_query(
  query: str, params: tuple = None, fetch_one: bool = False
):  # fetch_one 파라미터 확인
  """DB 쿼리를 실행하고 결과를 반환하는 함수"""
  results = None
  try:
    with get_db_connection() as conn:
      cursor = conn.cursor(dictionary=True)
      cursor.execute(query, params)

      if fetch_one:
        results = cursor.fetchone()
      else:
        results = cursor.fetchall()

      cursor.close()
  except mysql.connector.Error as err:
    logging.error(f"Database query error: {err}")
    raise HTTPException(status_code=500, detail="Database error occurred") from err
  return results
