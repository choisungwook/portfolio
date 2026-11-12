# AWS Emulator 핸즈온: 계정 없이 로컬에서 AWS API 테스트하기

2026년 11월에 나온 AWS Emulator를 macOS Docker로 띄워, 같은 boto3 코드를 emulator와 실제 AWS에서 나란히 실행합니다. 속도와 오류 응답이 얼마나 같은지, IAM 정책과 리전 같은 한계가 어디인지, AI agent용 `aws-emulator` skill의 호환성 점검이 무엇을 근거로 판정하는지 확인합니다.

## 문서

| 문서 | 내용 |
|---|---|
| [1-feature-map.md](docs/1-feature-map.md) | 기능 지도, 용어, 대안 비교, 시나리오 순서 |
| [setup.md](docs/setup.md) | Docker 이미지 빌드, 실행, 연결, 정리 |
| [2-endpoint-switch.md](docs/2-endpoint-switch.md) | 코드 변경 없이 endpoint만 바꾸기, 실제 AWS와 속도 비교 |
| [3-fidelity.md](docs/3-fidelity.md) | 오류 응답 7건 대조, release별 서비스 fidelity 점수 |
| [4-limits.md](docs/4-limits.md) | IAM 정책, 버킷 정책, 리전, 재시작, 서명 검사 |
| [5-agent-skill.md](docs/5-agent-skill.md) | `aws-emulator` skill 설치와 호환성 점검 판정 |
| [troubleshooting.md](docs/troubleshooting.md) | 실습 중 겪은 문제와 해결 |

## 실습 코드

| 경로 | 내용 |
|---|---|
| [docker/Dockerfile](docker/Dockerfile) | aarch64 RPM으로 만드는 emulator 이미지 |
| [emulator.env](emulator.env) | CLI와 SDK를 emulator로 보내는 환경 변수 |
| [app/order_flow.py](app/order_flow.py) | S3, DynamoDB, SQS에 주문을 기록하는 앱. endpoint와 자격 증명이 코드에 없음 |
| [probes/](probes/) | 오류 응답 대조, 정책 없는 IAM 사용자, 버킷 Deny 정책 실험 스크립트 |
