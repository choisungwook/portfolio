import os
import signal
import socket
import threading
import time
import uuid


HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "9090"))
HOSTNAME = os.getenv("HOSTNAME", socket.gethostname())
READ_TIMEOUT_SECONDS = float(os.getenv("READ_TIMEOUT_SECONDS", "1"))
SHUTDOWN_TIMEOUT_SECONDS = float(os.getenv("SHUTDOWN_TIMEOUT_SECONDS", "5"))

shutdown_event = threading.Event()
active_threads = []


def log(event, **fields):
  values = " ".join(f"{key}={value}" for key, value in fields.items())
  print(f"ts={time.time():.3f} event={event} {values}".strip(), flush=True)


def install_signal_handlers():
  signal.signal(signal.SIGTERM, handle_signal)
  signal.signal(signal.SIGINT, handle_signal)


def handle_signal(signum, _frame):
  log("shutdown-signal", signum=signum)
  shutdown_event.set()


def make_response(conn_id, message):
  return f"hostname={HOSTNAME} pid={os.getpid()} conn={conn_id} msg={message}\n"


def send_response(connection, conn_id, message):
  response = make_response(conn_id, message)
  connection.sendall(response.encode("utf-8"))
  log("message", conn=conn_id, msg=message, response=response.strip())


def handle_buffer(connection, conn_id, buffer):
  while b"\n" in buffer:
    raw_message, buffer = buffer.split(b"\n", 1)
    message = raw_message.decode("utf-8", errors="replace").strip()
    if message:
      send_response(connection, conn_id, message)
  return buffer


def handle_connection(connection, address):
  conn_id = uuid.uuid4().hex[:8]
  log("client-connected", conn=conn_id, address=f"{address[0]}:{address[1]}")
  buffer = b""

  with connection:
    connection.settimeout(READ_TIMEOUT_SECONDS)
    while not shutdown_event.is_set():
      try:
        chunk = connection.recv(4096)
      except socket.timeout:
        continue

      if not chunk:
        break

      buffer += chunk
      buffer = handle_buffer(connection, conn_id, buffer)

  log("client-disconnected", conn=conn_id)


def start_connection_thread(connection, address):
  thread = threading.Thread(target=handle_connection, args=(connection, address), daemon=True)
  active_threads.append(thread)
  thread.start()


def serve(listener):
  listener.settimeout(1)
  while not shutdown_event.is_set():
    try:
      connection, address = listener.accept()
    except socket.timeout:
      continue
    start_connection_thread(connection, address)


def wait_for_connections():
  deadline = time.monotonic() + SHUTDOWN_TIMEOUT_SECONDS
  for thread in active_threads:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
      break
    thread.join(timeout=remaining)


def main():
  install_signal_handlers()

  with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind((HOST, PORT))
    listener.listen()
    log("server-started", host=HOST, port=PORT, hostname=HOSTNAME)
    serve(listener)

  wait_for_connections()
  log("server-stopped")


if __name__ == "__main__":
  main()
