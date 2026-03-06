import base64
import gzip
import json
import os
from datetime import datetime

import boto3

s3_client = boto3.client("s3")

BUCKET_NAME = os.environ["BUCKET_NAME"]
PREFIX = os.environ.get("PREFIX", "lambda-logs")


def handler(event, context):
    # CloudWatch Logs subscription filter는 base64 + gzip으로 데이터를 전달
    compressed_payload = base64.b64decode(event["awslogs"]["data"])
    uncompressed_payload = gzip.decompress(compressed_payload)
    log_data = json.loads(uncompressed_payload)

    log_group = log_data.get("logGroup", "unknown")
    log_stream = log_data.get("logStream", "unknown")
    log_events = log_data.get("logEvents", [])

    if not log_events:
        print("No log events found")
        return {"statusCode": 200, "body": "No events"}

    # S3 key 생성: prefix/YYYY/MM/DD/HH/logGroup/logStream/timestamp.json
    now = datetime.utcnow()
    s3_key = (
        f"{PREFIX}/"
        f"{now.strftime('%Y/%m/%d/%H')}/"
        f"{log_group.strip('/')}/"
        f"{log_stream}/"
        f"{now.strftime('%Y%m%d%H%M%S')}_{context.aws_request_id}.json"
    )

    body = json.dumps(log_data, ensure_ascii=False, indent=2)

    s3_client.put_object(
        Bucket=BUCKET_NAME,
        Key=s3_key,
        Body=body,
        ContentType="application/json",
    )

    print(f"Saved {len(log_events)} log events to s3://{BUCKET_NAME}/{s3_key}")

    return {"statusCode": 200, "body": f"Saved {len(log_events)} events"}
