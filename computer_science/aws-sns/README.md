# AWS SNS Pub/Sub 예제

## 왜 SNS인가

SQS가 1:1 메시지 큐라면, SNS는 1:N 메시지 브로드캐스트다. 하나의 이벤트를 여러 구독자에게 동시에 알려야 할 때 사용한다. 예를 들어 "주문 완료" 이벤트가 발생하면 이메일 알림, 재고 처리, 로그 저장을 동시에 트리거할 수 있다.

## SQS vs SNS 비교

| 구분 | SQS | SNS |
|------|-----|-----|
| 패턴 | 1:1 (Producer → Consumer) | 1:N (Publisher → Subscribers) |
| 메시지 보관 | 큐에 보관, consumer가 꺼내야 함 | 보관 안 함, 즉시 push |
| 수신 방식 | consumer가 pull | SNS가 구독자에게 push |
| 주요 용도 | 작업 분산, 비동기 처리 | 이벤트 알림, 팬아웃 |

## 핵심 개념

- **Topic**: 메시지를 발행하는 채널. publisher는 토픽에 메시지를 보낸다.
- **Subscription**: 토픽을 구독하는 엔드포인트. SQS, Lambda, HTTP, Email 등 다양한 프로토콜을 지원한다.
- **Fanout**: 하나의 메시지가 모든 구독자에게 동시에 전달되는 패턴. SNS + SQS 조합이 대표적이다.

## 구조

```
aws-sns/
├── README.md
├── terraform/          # SNS 토픽 + SQS 구독자 인프라
│   ├── terraform.tf
│   ├── providers.tf
│   ├── variables.tf
│   ├── sns.tf
│   └── outputs.tf
└── examples/           # Python 예제
    ├── publisher.py    # 토픽에 메시지 발행
    └── subscriber.py   # SQS 경유로 메시지 수신
```

## 실습 순서

### 1. 인프라 생성

```bash
cd terraform
terraform init
terraform apply -var="email_address=your@email.com"
```

이메일 구독은 확인 메일의 링크를 클릭해야 활성화된다.

`terraform output`으로 `topic_arn`과 `subscriber_queue_url`을 확인한다.

### 2. Python 예제 실행

예제 파일에서 `TOPIC_ARN`과 `QUEUE_URL` 값을 교체한다.

터미널 2개를 열어서 subscriber를 먼저 실행하고, 다른 터미널에서 publisher를 실행한다.

subscriber를 실행한다.

```bash
pip install boto3
python examples/subscriber.py
```

publisher로 메시지를 발행한다.

```bash
python examples/publisher.py
```

subscriber 터미널에서 메시지가 수신되는 것을 확인한다. 동시에 이메일로도 알림이 온다.

### 3. 정리

```bash
cd terraform
terraform destroy -var="email_address=your@email.com"
```

## 참고자료

- https://docs.aws.amazon.com/sns/latest/dg/welcome.html
- https://docs.aws.amazon.com/sns/latest/dg/sns-sqs-as-subscriber.html
