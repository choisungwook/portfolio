# 개요

- 첫 번째 목표는 Cilium을 전혀 모르는 사람이 실습하는 것이 목표입니다.
- 두 번째 목표는 Cilium을 사용하여 Gateway API 및 트래픽 관리 기능을 익히는 것입니다.
- 세 번째 목표는 eBPF가 무엇인지 실습을 통해 확인하는 것입니다.

## contexts

1. 실습 환경은 ARM 기반의 MacBook Pro입니다.
2. 쿠버네티스 클러스터는 Talos를 사용하며, Docker Desktop 환경에서 구성됩니다.
3. Cilium은 Helm 차트로 설치됩니다.
4. Cilium을 사용하므로 kube-proxy는 사용하지 않습니다.
5. eBPF 개념에 대해 간략히 학습했습니다.

## requirements

- Cilium 예제는 공식 문서의 퀵스타트를 사용합니다.
  - 퀵스타트 실습에 필요한 설명(README.md 등)은 `examples/official_quickstart` 디렉터리에서 작성합니다.
  - 퀵스타트 예제 링크: https://docs.cilium.io/en/stable/gettingstarted/demo
- 만약 Cilium 퀵스타트 예제가 아닌 커스텀 예제는 `examples/not_official` 디렉터리에서 작업합니다.
  - 쿠버네티스 매니페스트 작성 시에는 `default` 네임스페이스를 사용합니다.
  - 리소스별로 YAML 파일을 분리합니다. (예: `deployment.yaml`, `service.yaml` 등)
  - Talos Linux 환경에서는 PSP(PodSecurityPolicy)가 설정되어 있으므로, 매니페스트 설정 시 이를 고려해야 합니다.
  - `default` 네임스페이스를 사용합니다.

## 서브 에이전트 활용

### @ebpf-knowledge

- eBPF 학습 내용을 파악하고 Cilium 학습에 연결합니다.
- eBPF 기본 개념 (커널/유저 공간, 헬퍼 함수, BPF 맵)
- 검증 방법 (bpftool, /proc, strace 등)
- Cilium 디버깅 시 eBPF 지식 활용

--사용 시점--:

- eBPF 관련 개념 설명 필요시
- Cilium 아키텍처와 eBPF 연결 설명시
- 디버깅 방법 안내시
