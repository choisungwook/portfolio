# CloudWatch Application Signals(APM) 핸즈온

# 요약

- CloudWatch Application Signals는 AWS의 네이티브 APM 솔루션이다. **코드 변경 없이 애플리케이션의 메트릭, 트레이스를 자동으로 수집**한다
- 내부적으로 AWS Distro for OpenTelemetry(ADOT)를 사용하여 auto-instrumentation을 수행한다
- Python, Java(Spring Boot) 애플리케이션을 EC2에 배포하고 Application Signals를 연동하는 실습을 다룬다
- Terraform으로 EC2, IAM, Security Group을 프로비저닝하고, 쉘 스크립트로 CloudWatch Agent와 ADOT를 설치한다

# 목차

- [CloudWatch Application Signals란?](#cloudwatch-application-signals란)
- [아키텍처](#아키텍처)
- [사전 준비](#사전-준비)
- [실습 1: Terraform으로 인프라 생성](#실습-1-terraform으로-인프라-생성)
- [실습 2: Python Flask 애플리케이션](#실습-2-python-flask-애플리케이션)
- [실습 3: Spring Boot 애플리케이션](#실습-3-spring-boot-애플리케이션)
- [CloudWatch 콘솔에서 확인하기](#cloudwatch-콘솔에서-확인하기)
- [주의사항](#주의사항)
- [리소스 정리](#리소스-정리)
- [참고자료](#참고자료)

# CloudWatch Application Signals란?

CloudWatch Application Signals는 두 가지 단어를 합친 용어다.

1. **Application Signals**: 애플리케이션이 보내는 신호(메트릭, 트레이스)
2. **CloudWatch**: AWS의 모니터링 서비스

**정리하면, 애플리케이션의 성능 신호를 CloudWatch에서 수집하고 분석하는 APM 서비스**다.

기존에는 Datadog, New Relic 같은 서드파티 APM을 사용해야 했다. CloudWatch Application Signals는 AWS 네이티브로 동일한 기능을 제공한다.

## 자동으로 수집하는 메트릭(Golden Signals)

Application Signals가 자동으로 수집하는 핵심 메트릭은 5가지다.

| 메트릭 | 설명 |
|---|---|
| Call Volume | 분당 요청 수(throughput) |
| Availability | 서비스 가용성 |
| Latency | 응답 시간(p50, p90, p99) |
| Faults | 5xx 에러 비율 |
| Errors | 4xx 에러 비율 |

## 어떻게 코드 변경 없이 수집할까?

핵심은 **AWS Distro for OpenTelemetry(ADOT)의 auto-instrumentation**이다.

- Python: `opentelemetry-instrument` 명령어가 애플리케이션을 감싸서 실행한다
- Java: `-javaagent` 옵션으로 JVM 시작 시 ADOT agent를 붙인다

두 경우 모두 애플리케이션 코드를 수정하지 않는다. 실행 방법만 바꾸면 된다.

# 아키텍처

```
┌──────────────────────────────────────────────────┐
│                    EC2 Instance                   │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │         Application (Python / Java)          │ │
│  │                                               │ │
│  │  ADOT Auto-Instrumentation                   │ │
│  │  (opentelemetry-instrument / -javaagent)     │ │
│  └──────────────┬────────────────────────────────┘ │
│                 │ OTLP (HTTP :4316)               │
│                 v                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │          CloudWatch Agent                    │ │
│  │  - Application Signals 메트릭 수신           │ │
│  │  - 트레이스 수신 및 전달                      │ │
│  │  - 고카디널리티 관리(keep/drop/replace)       │ │
│  └──────────────┬────────────────────────────────┘ │
└─────────────────┼────────────────────────────────┘
                  │
                  v
┌──────────────────────────────────────────────────┐
│              AWS Cloud Backend                    │
│                                                   │
│  CloudWatch Metrics         AWS X-Ray Traces     │
│  (ApplicationSignals        (분산 트레이싱)       │
│   namespace)                                      │
│         │                        │                │
│         v                        v                │
│  ┌──────────────────────────────────────────┐    │
│  │    CloudWatch Application Signals        │    │
│  │    - Service Map (서비스 맵)              │    │
│  │    - Service Detail (서비스 상세)         │    │
│  │    - SLO Dashboard                       │    │
│  │    - Correlated Traces (연관 트레이스)    │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

**핵심 흐름은 3단계**다.

1. ADOT가 애플리케이션의 HTTP 요청/응답을 자동으로 계측(instrumentation)한다
2. 계측 데이터를 CloudWatch Agent의 OTLP 수신 포트(4316)로 전송한다
3. CloudWatch Agent가 데이터를 CloudWatch Metrics와 X-Ray로 전달한다

# 사전 준비

- AWS 계정
- Terraform >= 1.0
- AWS CLI 설정 완료 (`aws configure`)
- SSH 키페어 (EC2 접속용)

## Application Signals 활성화

CloudWatch 콘솔에서 Application Signals를 활성화해야 한다. **한 번만 하면 된다.**

```
CloudWatch 콘솔 → Application Signals → Services → "Start discovering your Services" 클릭
```

이 과정에서 `AWSServiceRoleForCloudWatchApplicationSignals` 서비스 연결 역할이 자동으로 생성된다.

# 실습 1: Terraform으로 인프라 생성

Terraform으로 EC2 인스턴스와 필요한 IAM Role, Security Group을 생성한다.

## 파일 구조

```
terraform/
├── provider.tf              # Terraform, AWS provider 설정
├── variables.tf             # 변수 정의
├── terraform.tfvars.example # 변수 값 예시
├── data.tf                  # 데이터 소스 (VPC, Subnet, AMI)
├── iam.tf                   # IAM Role, Instance Profile
├── security_group.tf        # Security Group
├── ec2.tf                   # EC2 Instance
└── outputs.tf               # 출력 값
```

## 실행 방법

```bash
cd terraform

# 변수 파일 복사 후 수정
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars에서 key_name을 본인 키페어 이름으로 변경

terraform init
terraform plan
terraform apply
```

`terraform apply`가 완료되면 EC2 인스턴스의 퍼블릭 IP가 출력된다.

```bash
# SSH 접속
ssh -i ~/.ssh/your-key.pem ec2-user@<public_ip>
```

## IAM 권한

EC2에 부여하는 IAM 정책은 2개다.

| 정책 | 용도 |
|---|---|
| `CloudWatchAgentServerPolicy` | CloudWatch Agent가 메트릭, 로그를 전송 |
| `AWSXrayWriteOnlyAccess` | 트레이스 데이터를 X-Ray로 전송 |

# 실습 2: Python Flask 애플리케이션

## CloudWatch Agent 설치

EC2에 SSH 접속 후 CloudWatch Agent를 설치하고 설정한다.

```bash
# CloudWatch Agent 설치 (Amazon Linux 2023, ARM64)
sudo rpm -U https://amazoncloudwatch-agent.s3.amazonaws.com/amazon_linux/arm64/latest/amazon-cloudwatch-agent.rpm

# 설정 파일 복사
sudo cp cloudwatch-agent/config.json /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

# CloudWatch Agent 시작
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
```

## 애플리케이션 설치 및 실행

```bash
# Python 패키지 설치
cd python-app
pip install -r requirements.txt

# ADOT Python auto-instrumentation 설치
pip install aws-opentelemetry-distro
```

Application Signals를 활성화하려면 환경변수를 설정하고 `opentelemetry-instrument`로 실행한다.

```bash
OTEL_METRICS_EXPORTER=none \
OTEL_LOGS_EXPORTER=none \
OTEL_AWS_APPLICATION_SIGNALS_ENABLED=true \
OTEL_PYTHON_DISTRO=aws_distro \
OTEL_PYTHON_CONFIGURATOR=aws_configurator \
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \
OTEL_TRACES_SAMPLER=xray \
OTEL_TRACES_SAMPLER_ARG="endpoint=http://localhost:2000" \
OTEL_AWS_APPLICATION_SIGNALS_EXPORTER_ENDPOINT=http://localhost:4316/v1/metrics \
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4316/v1/traces \
OTEL_RESOURCE_ATTRIBUTES="service.name=python-flask-demo" \
opentelemetry-instrument python app.py
```

편의를 위해 `scripts/run-python.sh` 스크립트를 제공한다.

```bash
chmod +x scripts/run-python.sh
./scripts/run-python.sh
```

## 환경변수가 왜 이렇게 많을까?

각 환경변수의 역할을 정리하면 다음과 같다.

| 환경변수 | 값 | 역할 |
|---|---|---|
| `OTEL_PYTHON_DISTRO` | `aws_distro` | AWS 배포판 선택 |
| `OTEL_PYTHON_CONFIGURATOR` | `aws_configurator` | AWS 설정기 선택 |
| `OTEL_AWS_APPLICATION_SIGNALS_ENABLED` | `true` | Application Signals 활성화 |
| `OTEL_METRICS_EXPORTER` | `none` | 기본 메트릭 내보내기 비활성화 |
| `OTEL_LOGS_EXPORTER` | `none` | 기본 로그 내보내기 비활성화 |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` | CW Agent와 HTTP 통신 |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | `http://localhost:4316/v1/traces` | 트레이스 수신 엔드포인트 |
| `OTEL_AWS_APPLICATION_SIGNALS_EXPORTER_ENDPOINT` | `http://localhost:4316/v1/metrics` | 메트릭 수신 엔드포인트 |
| `OTEL_TRACES_SAMPLER` | `xray` | X-Ray 원격 샘플링 사용 |

**정리하면, ADOT 배포판을 사용하고, 데이터를 로컬 CloudWatch Agent(포트 4316)로 보내겠다는 설정**이다.

## 트래픽 생성

애플리케이션이 실행되면 트래픽을 보내서 메트릭을 생성한다.

```bash
# 상품 목록 조회
curl http://localhost:5000/products

# 상품 상세 조회
curl http://localhost:5000/products/1

# 주문 생성
curl -X POST http://localhost:5000/orders \
  -H "Content-Type: application/json" \
  -d '{"product_id": 1, "quantity": 2}'

# 주문 목록 조회
curl http://localhost:5000/orders

# 반복 트래픽 생성
for i in $(seq 1 100); do
  curl -s http://localhost:5000/products > /dev/null
  curl -s http://localhost:5000/products/$((RANDOM % 3 + 1)) > /dev/null
  curl -s -X POST http://localhost:5000/orders \
    -H "Content-Type: application/json" \
    -d "{\"product_id\": $((RANDOM % 3 + 1)), \"quantity\": $((RANDOM % 5 + 1))}" > /dev/null
done
```

# 실습 3: Spring Boot 애플리케이션

## CloudWatch Agent 설치

Python 실습과 동일하다. 이미 설치했으면 건너뛴다.

## ADOT Java Agent 다운로드

```bash
wget https://github.com/aws-observability/aws-otel-java-instrumentation/releases/latest/download/aws-opentelemetry-agent.jar \
  -O /opt/aws-opentelemetry-agent.jar
```

## 애플리케이션 빌드 및 실행

```bash
cd spring-boot-app

# Gradle 빌드
./gradlew bootJar

# Application Signals 활성화하여 실행
JAVA_TOOL_OPTIONS="-javaagent:/opt/aws-opentelemetry-agent.jar" \
OTEL_METRICS_EXPORTER=none \
OTEL_LOGS_EXPORTER=none \
OTEL_AWS_APPLICATION_SIGNALS_ENABLED=true \
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4316/v1/traces \
OTEL_AWS_APPLICATION_SIGNALS_EXPORTER_ENDPOINT=http://localhost:4316/v1/metrics \
OTEL_TRACES_SAMPLER=xray \
OTEL_TRACES_SAMPLER_ARG="endpoint=http://localhost:2000" \
OTEL_RESOURCE_ATTRIBUTES="service.name=spring-boot-demo" \
java -jar build/libs/demo-0.0.1-SNAPSHOT.jar
```

편의를 위해 `scripts/run-springboot.sh` 스크립트를 제공한다.

```bash
chmod +x scripts/run-springboot.sh
./scripts/run-springboot.sh
```

## Python과 다른 점은?

Java는 `JAVA_TOOL_OPTIONS`에 `-javaagent` 옵션을 추가한다. JVM이 시작될 때 ADOT agent가 자동으로 attach되어 Spring MVC 컨트롤러, JDBC, HTTP 클라이언트 등을 계측한다.

나머지 `OTEL_*` 환경변수는 Python과 동일하다. **데이터를 보내는 목적지(CloudWatch Agent)와 프로토콜은 언어와 관계없이 같기 때문**이다.

## 트래픽 생성

```bash
# 상품 목록 조회
curl http://localhost:8080/products

# 상품 상세 조회
curl http://localhost:8080/products/1

# 주문 생성
curl -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -d '{"productId": 1, "quantity": 2}'

# 반복 트래픽 생성
for i in $(seq 1 100); do
  curl -s http://localhost:8080/products > /dev/null
  curl -s http://localhost:8080/products/$((RANDOM % 3 + 1)) > /dev/null
  curl -s -X POST http://localhost:8080/orders \
    -H "Content-Type: application/json" \
    -d "{\"productId\": $((RANDOM % 3 + 1)), \"quantity\": $((RANDOM % 5 + 1))}" > /dev/null
done
```

# CloudWatch 콘솔에서 확인하기

트래픽을 보낸 후 2~3분 정도 기다리면 CloudWatch 콘솔에서 데이터를 확인할 수 있다.

## Service Map 확인

```
CloudWatch 콘솔 → Application Signals → Service Map
```

서비스 간 호출 관계를 시각적으로 보여준다. `python-flask-demo`와 `spring-boot-demo` 서비스가 각각 노드로 표시된다.

## Service Detail 확인

Service Map에서 서비스를 클릭하면 상세 페이지로 이동한다.

확인할 수 있는 항목:
- **Operations**: API 엔드포인트별 Latency, Error Rate, Call Volume
- **Dependencies**: 이 서비스가 호출하는 외부 서비스/DB
- **Correlated Traces**: 특정 시점의 트레이스를 드릴다운

## SLO 생성

Application Signals의 SLO 기능으로 서비스 수준 목표를 설정할 수 있다.

```
Application Signals → SLOs → Create SLO
```

예시: "python-flask-demo 서비스의 p99 latency가 500ms 이하"를 99.9% 달성

SLO를 생성하면 **Error Budget**을 자동으로 추적하고, 소진 속도가 빠르면 CloudWatch Alarm을 트리거한다.

# 주의사항

## CloudWatch Agent 포트 충돌

CloudWatch Agent는 기본적으로 포트 **4316**(HTTP OTLP)을 사용한다. 다른 프로세스가 이 포트를 사용하고 있으면 Agent가 시작되지 않는다.

```bash
# 포트 사용 확인
sudo lsof -i :4316
```

## Python WSGI 서버 사용 시

gunicorn이나 uWSGI를 사용할 때는 추가 환경변수가 필요하다.

```bash
OTEL_AWS_PYTHON_DEFER_TO_WORKERS_ENABLED=true
```

이 설정이 없으면 master process에서만 계측이 실행되고, worker process에서는 동작하지 않는다.

## Flask/Django 디버그 모드

Flask의 `use_reloader=True`(기본값)는 auto-instrumentation을 깨뜨린다. 개발 시에도 `use_reloader=False`로 설정해야 한다.

## 비용

Application Signals는 수집하는 메트릭 수와 X-Ray 트레이스 수에 따라 비용이 발생한다. 실습이 끝나면 반드시 리소스를 정리하자.

# 리소스 정리

```bash
# EC2에서 CloudWatch Agent 중지
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a stop

# Terraform 리소스 삭제
cd terraform
terraform destroy
```

# 참고자료

- https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Monitoring-Sections.html
- https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Signals-Enable-EC2Main.html
- https://aws.amazon.com/blogs/mt/monitoring-python-apps-using-amazon-cloudwatch-application-signals/
- https://aws.amazon.com/blogs/mt/monitor-java-apps-running-on-tomcat-server-with-amazon-cloudwatch-application-signals-preview/
- https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html
- https://github.com/aws-observability/application-signals-demo
