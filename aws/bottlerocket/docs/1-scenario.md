# 시나리오와 읽는 순서

AL2023 노드만 운영해 본 사람이 Bottlerocket 노드를 처음 맡았다고 가정한다. 습관대로 하던 일이 하나씩 거부되는 순서를 따라가며, 왜 거부되는지와 대신 무엇을 하는지를 익힌다.

## 처음 만나는 상황

- 노드에 SSH를 시도하면 연결이 거부된다. host에 sshd가 없다
- 겨우 셸을 열어도 `dnf`, `python3`, `crontab`이 없다
- `/etc` 아래 파일을 고쳤는데 재부팅하면 원래대로 돌아온다
- 노드가 NotReady인데 `kubectl debug node`가 pod를 띄우지 못한다

이 4가지는 버그가 아니라 설계다. 노드 상태를 "OS 이미지 + API 설정 값"만으로 정하려고 사람이 손댈 경로를 구조로 없앴다. 원리는 [2-concepts.md](2-concepts.md)에 있다.

## 이 핸즈온이 답하는 질문

- 셸이 없는 노드에 어떻게 들어가는가. control, admin, host 3층 구조를 직접 지나간다
- host에서 무엇이 거부되는가. 거부 메시지마다 어느 구조가 차단했는지 읽는다
- 설정을 어디에 넣어야 재부팅과 노드 교체 뒤에도 남는가
- OS 업데이트와 롤백이 A/B 파티션에서 어떻게 일어나는가
- EKS 노드가 NotReady일 때 3가지 접속 경로 중 무엇이 살아 있는가

## 환경은 2개다. EC2 단독을 먼저 한다

| 환경 | 문서 | 걸리는 시간 | 시간당 비용 | 쓰는 이유 |
|---|---|---|---|---|
| EC2 단독 1대 | 3~6장 | 띄우는 데 2분 | 약 0.05 USD | 클러스터 없이 host 구조, 설정, 업데이트를 본다 |
| EKS 1.36 + 노드그룹 1대 | 7~8장 | 띄우는 데 15분 | 약 0.15 USD | 노드 장애 상황에서 접속 경로를 비교한다 |

- EC2 단독은 EKS 노드와 같은 `aws-k8s-1.36` 변형 AMI다. 설정 키와 host container 동작이 같아서 여기서 본 결과가 EKS 노드에 그대로 적용된다
- 클러스터 설정이 없어 kubelet은 시작하지 못한다. 그래도 SSM 접속과 admin container는 동작한다. 이 사실이 8장의 "NotReady 노드에도 들어갈 수 있다"의 근거다
- EKS 실습에서 헤매는 원인은 대부분 Bottlerocket이 아니라 클러스터 쪽이다. Bottlerocket 자체를 EC2에서 먼저 익히면 8장에서 원인을 분리하기 쉽다

## 읽는 순서

| 순서 | 문서 | 환경 | 얻는 것 |
|---|---|---|---|
| 1 | [2-concepts.md](2-concepts.md) | 없음 | 셸이 없는 이유, host container, API 설정, 읽기 전용 루트, A/B 업데이트 |
| 2 | [3-setup-ec2.md](3-setup-ec2.md) | EC2 | 인스턴스 1대 up·down |
| 3 | [4-first-access.md](4-first-access.md) | EC2 | SSM → control → admin → host 순서로 들어가고, 층마다 내가 어디 있는지 확인 |
| 4 | [5-cannot-do.md](5-cannot-do.md) | EC2 | SSH, 패키지 설치, 루트 쓰기, cron이 거부되는 방식과 대안 |
| 5 | [6-settings-and-update.md](6-settings-and-update.md) | EC2 | `apiclient set`의 지속 범위, `/etc`와 `/local`의 차이, A/B 업데이트와 롤백 |
| 6 | [7-setup-eks.md](7-setup-eks.md) | EKS | 클러스터와 Bottlerocket 노드그룹 up·down |
| 7 | [8-eks-emergency-access.md](8-eks-emergency-access.md) | EKS | kubelet을 멈춘 NotReady 노드에서 3가지 경로 비교 |
| 8 | [9-operations.md](9-operations.md) | 없음 | 운영에서 AL2023과 판단이 달라지는 지점 |

실습 문서(3~8장)는 같은 구조다.

- **원리**: 이 실습이 확인하려는 구조를 2장에서 한 문단으로 가져온다
- **실습**: 명령과 예상 결과. 결과는 표의 "위치" 열이 가리키는 셸에서 나온다
- **트러블슈팅**: 그 단계에서 자주 멈추는 지점과 원인, 확인 명령
- **정리**: 다음 문서로 넘어가기 전에 지우거나 되돌릴 것

## 준비물

- Terraform 1.11 이상, AWS CLI v2, session-manager-plugin
- kubectl. EKS 실습(7~8장)에만 필요하다
- ap-northeast-2에 default VPC
- 관리자 권한 AWS profile
- SSH 공개키. admin container SSH 비교(4장 선택 절, 8장 경로 2)에만 필요하다

session-manager-plugin이 없으면 `aws ssm start-session`이 `SessionManagerPlugin is not found`로 끝난다. 설치 여부를 먼저 본다.

```bash
session-manager-plugin --version
```

## 용어

| 용어 | 뜻 |
|---|---|
| host | Bottlerocket OS 자체. 셸, 패키지 관리자, sshd가 없다 |
| host container | host의 별도 containerd에서 도는 컨테이너. Kubernetes가 모른다 |
| control container | 기본으로 켜진 host container. SSM agent와 `apiclient`가 있다. SSM 세션이 여기로 들어온다 |
| admin container | 기본으로 꺼진 host container. sshd와 일반 Linux 도구, `sheltie`가 있다 |
| sheltie | admin container에서 host root 셸로 들어가는 스크립트 |
| apiclient | host API에 설정을 조회하고 바꾸는 명령. control container에 있다 |
| user data TOML | 부팅 때 API에 넣는 설정 원본. EC2 user data에 TOML로 쓴다 |
| 변형(variant) | `aws-k8s-1.36`처럼 용도와 Kubernetes 버전이 박힌 이미지 종류 |
| signpost | A/B 파티션 중 어느 쪽으로 부팅할지 바꾸는 명령. host에 있다 |
| bootstrap container | 부팅 때 1회 실행하는 컨테이너. AL2023 user data 셸 스크립트의 대체 |

## 결과 열의 상태

3~8장의 예상 결과는 Bottlerocket 공식 문서와 control, admin container 소스 기준이다. 실측하지 않았다(확인 필요). 실행 결과가 다르면 그 문서를 고치고 문서 상단의 안내를 지운다.
