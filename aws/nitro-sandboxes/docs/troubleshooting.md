# Troubleshooting

실습 중 실제로 겪은 문제와 해결 방법입니다.

## Firecracker가 `CMA allocation failed ... Out of memory`로 종료됨

- 증상: `free -m`으로는 메모리가 충분한데 `firecracker --config-file sandbox.json`이 `Failed to allocate CMA memory: Cannot create mmap region: Out of memory (os error 12)`로 끝납니다.
- 원인: Sandbox 메모리는 부팅할 때 예약한 memory pool에서만 나옵니다. pool이 없으면 `/sys/class/misc/nitro_enclaves/mem_pool/total`이 0입니다.
- 해결: `sudo grubby --update-kernel=ALL --args="nitro_enclaves.mempool=2G@0"` 후 재부팅하고, `sudo dmesg | grep "CMA pool"`로 예약을 확인합니다.

## `NE_ERR_NO_CPUS_AVAIL_IN_POOL`로 종료됨

- 증상: `cpu_overcommit` 없이 `vcpu_count: 2`로 실행하면 `no CPUs are available in the NE CPU pool`이 납니다.
- 원인: 전용 vCPU 모드에서는 드라이버가 첫 번째 코어를 부모 몫으로 남깁니다. `m7g.large`는 CPU pool이 1입니다.
- 해결: `cpu_pool/free` 이하로 `vcpu_count`를 줄이거나 `"cpu_overcommit": true`를 켭니다.

## 재부팅 후 Sandbox 네트워크가 안 됨

- 증상: 재부팅 전에는 되던 guest의 바깥 연결이 실패합니다.
- 원인: TAP 디바이스, `net.ipv4.ip_forward`, nftables 규칙은 재부팅하면 사라집니다.
- 해결: [시나리오 3](3-ec2-firecracker-sandbox.md)의 6, 7, 10단계를 다시 실행합니다.

## 두 번째 실행이 `Address in use`로 실패함

- 원인: Firecracker는 종료할 때 vsock의 `uds_path` socket 파일을 지우지 않습니다.
- 해결: 실행 전에 `sudo rm -f /run/sandbox/v.sock`을 실행합니다.

## 로컬 디스크가 가득 차서 `terraform init`이 실패함

- 증상: `Error while installing hashicorp/aws ...: no space left on device`
- 원인: AWS provider 바이너리 하나가 750MB 안팎이고, Terraform 디렉터리마다 따로 받습니다.
- 해결: 이미 받은 provider가 있으면 같은 볼륨에 hardlink로 mirror 디렉터리를 만들고 `terraform init -plugin-dir=<mirror>`로 설치합니다. hardlink는 디스크를 더 쓰지 않습니다.

## agent Job이 바로 실패함

- 증상: `kubectl apply -f manifests/ai-agent/` 직후 `agent` Job이 `Failed`가 됩니다.
- 원인: Job이 모델 다운로드(initContainer)와 executor 준비보다 먼저 시작해 `ollama` 연결이나 `pods/exec`가 실패합니다. `backoffLimit: 0`이라 재시도하지 않습니다.
- 해결: 모델과 executor가 Ready가 된 뒤 `kubectl delete -n ai-agent job/agent`와 `kubectl apply -f manifests/ai-agent/agent-job.yaml`로 다시 만듭니다.

## 세 executor가 모두 blocked인데 sandbox 때문이 아님

- 증상: agent 1차 실행에서 `steal-sa-token`, `call-internet`이 runc까지 모두 `blocked`였습니다.
- 원인: Gemma 2B가 `import` 누락, 없는 환경 변수 사용, `Request(timeout=...)` 같은 틀린 코드를 만들었습니다. runtime이 아니라 코드가 실패한 것입니다.
- 해결: 프롬프트에 사용할 함수와 예외 처리를 구체적으로 적고, 모든 executor가 같은 코드 오류로 죽으면 traceback을 Gemma에게 돌려줘 다시 만들게 합니다. `agent.py`의 `is_bad_code`가 이 판정을 맡고, 결과 로그의 `conclusive`로 남습니다.

