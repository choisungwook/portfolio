"""SNS Publisher — 토픽에 메시지를 발행하는 예제"""

import json
import boto3

TOPIC_ARN = "YOUR_TOPIC_ARN"  # terraform output topic_arn 값으로 교체

sns = boto3.client("sns", region_name="ap-northeast-2")


def publish_message(subject: str, body: dict) -> dict:
    """SNS 토픽에 메시지를 발행한다. 모든 구독자에게 동시에 전달된다."""
    response = sns.publish(
        TopicArn=TOPIC_ARN,
        Subject=subject,
        Message=json.dumps(body),
    )
    print(f"[발행] MessageId: {response['MessageId']}")
    return response


if __name__ == "__main__":
    publish_message(
        subject="주문 완료 알림",
        body={"order_id": 1, "status": "completed", "item": "product-1"},
    )
