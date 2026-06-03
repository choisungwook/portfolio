import os
import socket
import sys
import time


HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "9090"))
MODE = os.getenv("MODE", "interval")
MESSAGE = os.getenv("MESSAGE", "helloworld")
INTERVAL_SECONDS = float(os.getenv("INTERVAL_SECONDS", "5"))
CONNECT_TIMEOUT_SECONDS = float(os.getenv("CONNECT_TIMEOUT_SECONDS", "5"))
READ_TIMEOUT_SECONDS = float(os.getenv("READ_TIMEOUT_SECONDS", "10"))
AUTO_RECONNECT = os.getenv("AUTO_RECONNECT", "false").lower() == "true"
ENABLE_TCP_KEEPALIVE = os.getenv("ENABLE_TCP_KEEPALIVE", "false").lower() == "true"
MAX_MESSAGES = int(os.getenv("MAX_MESSAGES", "0"))


def log(event, **fields):
  values = " ".join(f"{key}={value}" for key, value in fields.items())
  print(f"ts={time.time():.3f} event={event} {values}".strip(), flush=True)


def configure_socket(connection):
  connection.settimeout(READ_TIMEOUT_SECONDS)
  if ENABLE_TCP_KEEPALIVE:
    connection.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
  return connection


def connect():
  connection = socket.create_connection((HOST, PORT), timeout=CONNECT_TIMEOUT_SECONDS)
  configure_socket(connection)
  log("connected", host=HOST, port=PORT)
  return connection


def read_line(connection):
  buffer = b""
  while b"\n" not in buffer:
    chunk = connection.recv(4096)
    if not chunk:
      raise ConnectionError("server closed connection")
    buffer += chunk
  line, _buffer = buffer.split(b"\n", 1)
  return line.decode("utf-8", errors="replace")


def send_message(connection, message):
  connection.sendall(f"{message}\n".encode("utf-8"))
  response = read_line(connection)
  log("response", message=message, response=response)


def reconnect_after_error(error):
  log("connection-error", error=repr(error), auto_reconnect=AUTO_RECONNECT)
  if not AUTO_RECONNECT:
    raise error
  time.sleep(INTERVAL_SECONDS)
  return connect()


def run_interval():
  sent = 0
  connection = connect()

  while MAX_MESSAGES == 0 or sent < MAX_MESSAGES:
    try:
      send_message(connection, MESSAGE)
      sent += 1
      time.sleep(INTERVAL_SECONDS)
    except OSError as error:
      connection.close()
      connection = reconnect_after_error(error)

  connection.close()


def run_manual():
  connection = connect()
  log("manual-ready")

  for line in sys.stdin:
    message = line.strip()
    if not message:
      continue

    try:
      send_message(connection, message)
    except OSError as error:
      connection.close()
      connection = reconnect_after_error(error)

  connection.close()


def main():
  if MODE == "interval":
    run_interval()
    return

  if MODE == "manual":
    run_manual()
    return

  raise ValueError(f"unsupported MODE={MODE}")


if __name__ == "__main__":
  main()
