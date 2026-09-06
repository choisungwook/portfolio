# 로컬 /etc/hosts 설정과 원복

- 대상: DNS 변경이 필요한 S01.
- 실행 환경: macOS 또는 Linux의 로컬 터미널. workspace의 가상환경을 활성화한 상태.
- 준비: [S01 setup](2-setup.md#up)에서 생성한 `runtime/hosts.entries`.
- STS 시작 자격증명은 hosts 변경 전에 [S01 프로파일 준비](2-setup.md#클라이언트-프로파일과-시작-주체)로 적재해요.
- 이 설정은 같은 컴퓨터의 다른 애플리케이션에도 적용돼요. 한 번에 한 시나리오만 진행해요.
- Python 실험과 출력 도구는 `/etc/hosts`를 자동 수정하지 않아요.

## Up

현재 파일을 날짜별로 백업하고, 추가할 실습 블록을 출력해요.

```bash
cp -p /etc/hosts "runtime/hosts.before.$(date +%Y%m%d-%H%M%S)"
{
  printf '%s\n' '# BEGIN agentcore-memory-static-ip'
  cat runtime/hosts.entries
  printf '%s\n' '# END agentcore-memory-static-ip'
} > runtime/hosts.block
cat runtime/hosts.block
```

- 출력에는 선택한 AZ의 NLB IP와 AWS 이름 두 쌍이 있어야 해요.
- 같은 실습 블록이 이미 있으면 먼저 [Down](#down)으로 제거해요.

관리자 권한으로 파일을 열고 출력된 블록을 끝에 추가해요.

```bash
sudoedit /etc/hosts
```

- BEGIN·END 표시와 그 사이의 두 줄만 추가해요.
- 같은 AWS 이름의 기존 IPv4·IPv6 항목이 있으면 백업에서 위치를 확인하고 실험 동안 주석 처리해요.
- 기존 항목을 그대로 둬서 여러 IP가 반환되면 클라이언트의 DNS 사전 검사가 실패해요.
- `sudoedit`가 없으면 `sudo vi /etc/hosts`로 같은 내용을 편집해요.

macOS에서는 DNS 캐시를 비워요.

```bash
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

Linux에서 systemd-resolved를 사용한다면 캐시를 비워요. 사용하지 않는 환경은 이 명령을 생략해요.

```bash
sudo resolvectl flush-caches
```

실제 Python이 사용하는 OS 이름 조회 결과를 확인해요.

```bash
python - <<'PY'
import socket
from pathlib import Path

for line in Path("runtime/hosts.entries").read_text().splitlines():
  expected, hostname = line.split()
  actual = {
    entry[4][0]
    for entry in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
  }
  if actual != {expected}:
    raise SystemExit(f"DNS mismatch: {hostname} -> {sorted(actual)}; expected {expected}")
  print(f"HOSTS_OK {hostname} -> {expected}")
PY
```

- `dig`는 DNS 서버를 직접 조회하므로 `/etc/hosts` 반영 확인에 사용하지 않아요.
- 두 항목이 모두 `HOSTS_OK`이면 해당 시나리오의 실험 명령을 실행해요.

## Down

- 실험 성공·실패와 관계없이 추가한 설정을 제거해요.
- 다른 시나리오로 전환하거나 Terraform destroy를 실행하기 전에 수행해요.

파일을 열어 BEGIN·END 표시와 그 사이의 실습 두 줄을 삭제해요.

```bash
sudoedit /etc/hosts
```

- 실험 전에 주석 처리한 기존 항목은 백업과 비교해 원래대로 복구해요.
- 백업 파일 전체를 덮어쓰면 실험 중 다른 프로그램이 추가한 설정도 사라질 수 있어요. 실습 변경분만 되돌려요.
- 위 Up의 OS별 DNS 캐시 초기화를 다시 실행하고 기존 Python 실험 프로세스를 종료해요.

표시가 제거됐는지 확인해요.

```bash
python - <<'PY'
from pathlib import Path

hosts = Path("/etc/hosts").read_text()
if "agentcore-memory-static-ip" in hosts:
  raise SystemExit("Remove the lab BEGIN/END block from /etc/hosts")
print("HOSTS_CLEANUP_OK")
PY
```

- 백업과 비교해 실습 IP·이름 두 줄도 남지 않았는지 확인해요.
- 이후 [S01 정리](2-setup.md#down)의 Terraform destroy와 runtime 설정 정리를 수행해요.
