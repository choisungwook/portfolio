# AWS SQS 메시지 큐 예제

## 왜 SQS인가

서비스 간에 직접 API를 호출하면 한쪽이 죽었을 때 메시지가 유실된다. SQS를 중간에 두면 producer가 보낸 메시지를 큐가 보관하고, consumer가 자기 속도로 꺼내서 처리할 수 있다. 즉, 두 서비스의 속도와 가용성을 분리(decoupling)하는 게 핵심이다.

## 핵심 개념

- **Producer**: 메시지를 큐에 넣는 쪽. `send_message` API를 호출한다.
- **Consumer**: 메시지를 큐에서 꺼내는 쪽. `receive_message`로 가져오고, 처리 완료 후 `delete_message`로 지운다.
- **Visibility Timeout**: consumer가 메시지를 받으면 다른 consumer에게 안 보이는 시간. 이 시간 안에 처리+삭제를 못 하면 메시지가 다시 큐에 나타난다.
- **Long Polling**: `WaitTimeSeconds > 0`으로 설정하면 메시지가 올 때까지 대기한다. 빈 응답을 줄여서 비용을 아낀다.

## 구조

```
aws-sqs/
├── README.md
├── terraform/          # SQS 큐 인프라
│   ├── terraform.tf
│   ├── providers.tf
│   ├── variables.tf
│   ├── sqs.tf
│   └── outputs.tf
└── examples/           # Python 예제
    ├── producer.py     # 메시지 보내기
    └── consumer.py     # 메시지 받기 + 삭제
```

## 실습 순서

### 1. 인프라 생성

```bash
cd terraform
terraform init
terraform apply
```

`terraform output queue_url`로 출력된 URL을 복사한다.

### 2. Python 예제 실행

예제 파일에서 `QUEUE_URL` 값을 위에서 복사한 URL로 교체한다.

producer로 메시지 3건을 보낸다.

```bash
pip install boto3
python examples/producer.py
```

consumer로 메시지를 꺼낸다.

```bash
python examples/consumer.py
```

### 3. 정리

```bash
cd terraform
terraform destroy
```

## 참고자료

- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html
