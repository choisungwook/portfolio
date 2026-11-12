"""부모 인스턴스에서 Firecracker 프로세스의 메모리를 읽어 guest가 만든 표식을 찾는다."""
import re
import sys

MIB = 1024 * 1024


def memory_regions(pid: int) -> list[tuple[int, int, str]]:
  """/proc/<pid>/maps의 모든 구간(시작, 끝, maps 한 줄)을 반환한다.

  root는 /proc/<pid>/mem으로 권한 비트(---s 등)와 상관없이 읽기를 시도할 수 있으므로 거르지 않는다.
  """
  regions = []
  with open(f"/proc/{pid}/maps") as maps:
    for line in maps:
      start, end = (int(x, 16) for x in line.split()[0].split("-"))
      regions.append((start, end, line.strip()))
  return regions


def count_marker(pid: int, marker: bytes) -> None:
  """16MiB 이상인 구간은 따로 출력하고, 전체 표식 횟수와 읽은 바이트 수를 출력한다."""
  total_hits, scanned = 0, 0
  with open(f"/proc/{pid}/mem", "rb", 0) as mem:
    for start, end, line in memory_regions(pid):
      try:
        mem.seek(start)
        chunk = mem.read(end - start)
      except OSError as error:
        chunk, hits = b"", f"read error ({error.strerror})"
      else:
        hits = len(re.findall(re.escape(marker), chunk))
        total_hits += hits
      scanned += len(chunk)
      if end - start >= 16 * 1024 * 1024:
        print(f"{(end - start) // MIB:>4} MiB {line.split()[1]} {line.split()[-1]} -> hits: {hits}")
  print(f"scanned {scanned // MIB} MiB, total marker hits: {total_hits}")


if __name__ == "__main__":
  pid, part_a, part_b = int(sys.argv[1]), sys.argv[2], sys.argv[3]
  marker = f"NSBX{part_a}{part_b}MARK".encode()
  count_marker(pid, marker)
