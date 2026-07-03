#!/usr/bin/env python3
import argparse
import fcntl
import os
import signal
import sys
import time


def parse_args():
  parser = argparse.ArgumentParser()
  parser.add_argument(
    "--lock-file",
    default="/var/cache/dnf/metadata_lock.pid",
    help="dnf metadata lock file path",
  )
  parser.add_argument("--seconds", type=int, default=120)
  return parser.parse_args()


def write_pid(lock_file):
  lock_file.seek(0)
  lock_file.truncate()
  lock_file.write(f"{os.getpid()}\n")
  lock_file.flush()
  os.fsync(lock_file.fileno())


def sleep_until_done(seconds):
  deadline = time.monotonic() + seconds
  while time.monotonic() < deadline:
    remaining = int(deadline - time.monotonic())
    print(f"holding dnf metadata lock for {remaining}s", flush=True)
    time.sleep(min(5, max(1, remaining)))


def main():
  args = parse_args()
  os.makedirs(os.path.dirname(args.lock_file), exist_ok=True)

  stop = {"requested": False}

  def request_stop(signum, _frame):
    stop["requested"] = True
    print(f"received signal {signum}; releasing lock", flush=True)

  signal.signal(signal.SIGTERM, request_stop)
  signal.signal(signal.SIGINT, request_stop)

  with open(args.lock_file, "a+", encoding="utf-8") as lock_file:
    fcntl.lockf(lock_file.fileno(), fcntl.LOCK_EX)
    write_pid(lock_file)
    print(f"locked {args.lock_file} with pid {os.getpid()}", flush=True)

    deadline = time.monotonic() + args.seconds
    while not stop["requested"] and time.monotonic() < deadline:
      sleep_until_done(min(5, int(deadline - time.monotonic())))

    fcntl.lockf(lock_file.fileno(), fcntl.LOCK_UN)

  return 0


if __name__ == "__main__":
  sys.exit(main())
