# 문제 해결 가이드 (Troubleshooting)

본 핸즈온을 구성하고 검증하는 과정에서 발생할 수 있는 주요 문제 상황과 해결 방법을 정리한 문서입니다.

---

## terraform plan이 private NAT gateway route에서 실패하는 경우

- **증상**: `terraform-aws-modules/vpc` 6.x 버전에서 `intra_subnets`와 `single_nat_gateway = true`를 함께 사용할 경우, plan 단계에서 `cannot use element function with an empty list` 에러가 발생하며 중단됩니다.
- **원인 및 해결 방법**: 모듈 내부에서 프라이빗 서브넷이 존재하지 않을 때 NAT 게이트웨이용 기본 라우팅을 자동 생성하려다 리스트 인덱스 에러가 발생하기 때문입니다. 모듈 입력 인자에 `create_private_nat_gateway_route = false`를 명시합니다. (본 실습의 `terraform/vpc.tf` 코드에는 이미 해당 옵션이 반영되어 있습니다.)

---

## egress-probe 출력이 HTTP 코드 대신 `%{http_code}` 문자열로 나오는 경우

- **증상**: EC2 인스턴스에서 `egress-probe` 로그를 확인했을 때 정상적인 상태 코드(예: `200`, `000`) 대신 `%{http_code}` 문자열 자체가 그대로 출력됩니다.
- **원인 및 해결 방법**: Terraform의 `user_data = file("egress-probe.sh")` 함수를 사용할 때 `%%{http_code}` 형태로 퍼센트 기호를 이스케이프하면 발생합니다. `file()` 함수는 템플릿 변수 치환을 수행하지 않으므로 퍼센트 기호를 한 번만(`%{http_code}`) 작성해야 합니다. (`%%` 이스케이프는 `templatefile()` 함수에서만 필요합니다.)

---

## Grafana 메트릭 패널이 빈 상태로 표시되는 경우

- **증상**: Grafana 대시보드에서 `AWS/NetworkFirewall` 메트릭 패널에 데이터가 전혀 조회되지 않고 빈 차트로 출력됩니다.
- **원인 및 해결 방법**:
  1. **필수 Dimension 누락 여부 확인**: CloudWatch의 `AWS/NetworkFirewall` 네임스페이스는 `FirewallName`, `AvailabilityZone`, `Engine` 3개의 차원이 모두 쿼리에 지정되어야만 데이터를 반환합니다. 하나라도 누락되면 빈 결과를 반환합니다.
  2. **트래픽 인입 여부 확인**: AWS Network Firewall은 패킷이 전혀 흐르지 않은 구간에 대해 0 값을 기록하지 않습니다. 시나리오 2의 7단계를 완료하여 실제 트래픽이 방화벽을 통과하고 있는지 확인하십시오.

---

## update-logging-configuration 실행 시 Alert와 Flow를 한 번에 등록하지 못하는 경우

- **증상**: AWS CLI의 `aws network-firewall update-logging-configuration` 명령어로 Alert와 Flow 로그를 한 번의 JSON 페이로드로 전달하면 호출이 거부됩니다.
- **원인 및 해결 방법**: AWS Network Firewall API 명세상 한 번의 API 호출로는 하나의 로그 타입 설정만 변경할 수 있습니다. Alert 설정을 먼저 생성한 후, 두 번째 호출에서 Alert와 Flow를 함께 전달하는 방식으로 2회 순차 호출해야 합니다. (자세한 명령어는 [2-traffic-inspection.md의 5단계](./2-traffic-inspection.md#5단계-alert-및-flow-로깅과-모니터링-대시보드-활성화) 참고)

---

## Rule Group 삭제 시 `still in use` 오류가 발생하는 경우

- **증상**: 방화벽 정책(Firewall Policy)을 삭제한 직후 룰 그룹을 삭제하려 하면 `Resource is still in use` 에러가 발생합니다.
- **원인 및 해결 방법**: 콘솔 상에서 정책 삭제가 완료된 것처럼 보이더라도 AWS 백엔드 리소스 간의 바인딩 해제가 완전히 전파되기까지 수십 초의 지연이 발생할 수 있습니다. 약 1분 정도 대기한 후 룰 그룹 삭제를 다시 시도합니다.

---

## 실습 도중 라우팅이 다시 NAT Gateway 직통으로 되돌아간 경우

- **증상**: 시나리오 2에서 App Route Table의 기본 경로를 방화벽 엔드포인트로 변경했는데, 어느 순간 다시 NAT Gateway로 되돌아가는 현상이 발생합니다.
- **원인 및 해결 방법**: 실습 진행 도중에 `terraform apply` 명령을 다시 실행하면, Terraform이 `aws_route.app_default` 리소스의 관리 상태를 유지하기 위해 라우팅 테이블의 타깃을 초기 상태인 NAT Gateway로 복원하기 때문입니다. 실습이 완전히 끝날 때까지 `terraform apply`를 재실행하지 마십시오. 만약 다시 실행되었다면 [2-traffic-inspection.md의 7단계](./2-traffic-inspection.md#7단계-라우팅-테이블-전환-및-방화벽-경유-검증) 라우팅 전환 명령을 다시 수행합니다.

---

## Linux Docker에서 Grafana가 CloudWatch를 읽지 못하는 경우

- **증상**: macOS Docker Desktop 환경에서는 정상 동작하지만, Linux 호스트 환경에서 Docker를 구동할 때 Grafana Data Source가 AWS 자격 증명 오류(Credentials error)를 발생시킵니다.
- **원인 및 해결 방법**: 공식 Grafana 도커 이미지는 기본적으로 비루트 사용자인 `grafana` (UID 472) 권한으로 실행됩니다. 호스트의 `~/.aws` 파일 권한이 `600`(소유자만 읽기 가능)으로 설정되어 있으면 컨테이너 내부 프로세스가 해당 인증 파일을 읽을 수 없습니다. `compose.yaml` 파일의 grafana 서비스 설정에 `user: "${UID}:${GID}"`와 같이 호스트 사용자 권한을 명시하거나, 파일 권한을 컨테이너에서 읽을 수 있도록 조정합니다.
