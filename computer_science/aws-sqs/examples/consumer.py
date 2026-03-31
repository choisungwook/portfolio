"""SQS Consumer — 큐에서 메시지를 꺼내는 예제"""

import json
import boto3

QUEUE_URL = "YOUR_QUEUE_URL"  # terraform output queue_url 값으로 교체

sqs = boto3.client("sqs", region_name="ap-northeast-2")


def receive_and_delete() -> None:
    """큐에서 메시지를 받고, 처리 후 삭제한다."""
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
        body = json.loads(msg["Body"])
        print(f"[받음] {body}")

        # 처리 완료 후 삭제 — 삭제하지 않으면 visibility timeout 후 다시 나타남
        sqs.delete_message(
            QueueUrl=QUEUE_URL,
            ReceiptHandle=msg["ReceiptHandle"],
        )
        print(f"[삭제] MessageId: {msg['MessageId']}")


if __name__ == "__main__":
    print("메시지 수신 대기 중... (Ctrl+C로 종료)")
    while True:
        receive_and_delete()
