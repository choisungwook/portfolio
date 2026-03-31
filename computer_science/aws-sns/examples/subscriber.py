"""SNS Subscriber (SQS 경유) — SNS 메시지를 SQS 큐에서 수신하는 예제

SNS는 push 방식이라 직접 poll할 수 없다.
그래서 SQS 큐를 구독자로 등록하고, SQS에서 메시지를 꺼내는 방식으로 수신한다.
"""

import json
import boto3

QUEUE_URL = "YOUR_QUEUE_URL"  # terraform output subscriber_queue_url 값으로 교체

sqs = boto3.client("sqs", region_name="ap-northeast-2")


def poll_messages() -> None:
    """SQS 큐에서 SNS가 전달한 메시지를 수신한다."""
    response = sqs.receive_message(
        QueueUrl=QUEUE_URL,
        MaxNumberOfMessages=5,
        WaitTimeSeconds=10,
    )

    messages = response.get("Messages", [])
    if not messages:
        print("[대기] 메시지 없음")
        return

    for msg in messages:
        # SNS가 SQS에 보내는 메시지는 한 번 더 감싸져 있다
        sns_envelope = json.loads(msg["Body"])
        subject = sns_envelope.get("Subject", "(제목 없음)")
        body = json.loads(sns_envelope["Message"])
        print(f"[수신] Subject: {subject}, Body: {body}")

        sqs.delete_message(
            QueueUrl=QUEUE_URL,
            ReceiptHandle=msg["ReceiptHandle"],
        )


if __name__ == "__main__":
    print("SNS 메시지 수신 대기 중... (Ctrl+C로 종료)")
    while True:
        poll_messages()
