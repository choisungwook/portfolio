"""SQS Producer — 메시지를 큐에 보내는 예제"""

import json
import boto3

QUEUE_URL = "YOUR_QUEUE_URL"  # terraform output queue_url 값으로 교체

sqs = boto3.client("sqs", region_name="ap-northeast-2")


def send_message(body: dict) -> dict:
    """SQS 큐에 메시지 1건을 전송한다."""
    response = sqs.send_message(
        QueueUrl=QUEUE_URL,
        MessageBody=json.dumps(body),
    )
    print(f"[보냄] MessageId: {response['MessageId']}")
    return response


if __name__ == "__main__":
    for i in range(3):
        send_message({"order_id": i + 1, "item": f"product-{i + 1}"})
