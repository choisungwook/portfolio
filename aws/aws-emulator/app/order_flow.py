# /// script
# requires-python = ">=3.12"
# dependencies = ["boto3==1.44.1"]
# ///
"""주문 하나를 S3, DynamoDB, SQS에 기록하는 흐름을 끝까지 실행하고 단계별 시간을 출력한다.

endpoint와 자격 증명은 코드에 없다. 환경 변수가 AWS Emulator를 가리키면 emulator로,
AWS profile을 가리키면 실제 AWS로 같은 코드가 요청을 보낸다.
"""
import json
import sys
import time
import uuid
from contextlib import contextmanager

import boto3

ORDER_COUNT = 5


@contextmanager
def timed(label: str):
  """블록 실행 시간을 초 단위로 출력한다."""
  started = time.perf_counter()
  yield
  print(f"{label:<10} {time.perf_counter() - started:6.2f}s", flush=True)


def create_resources(suffix: str) -> tuple[str, str, str]:
  """버킷, 테이블, 큐를 만들고 (버킷 이름, 테이블 이름, 큐 URL)을 반환한다. 테이블은 ACTIVE까지 기다린다."""
  region = boto3.session.Session().region_name
  bucket, table = f"order-receipts-{suffix}", f"orders-{suffix}"
  s3, dynamodb, sqs = boto3.client("s3"), boto3.client("dynamodb"), boto3.client("sqs")
  location = {} if region == "us-east-1" else {"CreateBucketConfiguration": {"LocationConstraint": region}}
  s3.create_bucket(Bucket=bucket, **location)
  dynamodb.create_table(
    TableName=table, BillingMode="PAY_PER_REQUEST",
    AttributeDefinitions=[{"AttributeName": "order_id", "AttributeType": "S"}],
    KeySchema=[{"AttributeName": "order_id", "KeyType": "HASH"}],
  )
  dynamodb.get_waiter("table_exists").wait(TableName=table, WaiterConfig={"Delay": 1})
  queue_url = sqs.create_queue(QueueName=f"order-events-{suffix}")["QueueUrl"]
  return bucket, table, queue_url


def place_orders(bucket: str, table: str, queue_url: str) -> None:
  """주문마다 영수증을 S3에, 주문 레코드를 DynamoDB에, 이벤트를 SQS에 쓴다."""
  s3, dynamodb, sqs = boto3.client("s3"), boto3.client("dynamodb"), boto3.client("sqs")
  for i in range(ORDER_COUNT):
    order_id = f"order-{i}"
    s3.put_object(Bucket=bucket, Key=f"receipts/{order_id}.json", Body=json.dumps({"order_id": order_id}))
    dynamodb.put_item(TableName=table, Item={"order_id": {"S": order_id}, "status": {"S": "PLACED"}})
    sqs.send_message(QueueUrl=queue_url, MessageBody=json.dumps({"order_id": order_id}))


def verify(bucket: str, table: str, queue_url: str) -> dict[str, int]:
  """세 저장소에 남은 주문 수를 센다. 모두 ORDER_COUNT여야 맞다."""
  s3, dynamodb, sqs = boto3.client("s3"), boto3.client("dynamodb"), boto3.client("sqs")
  receipts = s3.list_objects_v2(Bucket=bucket, Prefix="receipts/").get("KeyCount", 0)
  records = dynamodb.scan(TableName=table, Select="COUNT")["Count"]
  messages = 0
  while messages < ORDER_COUNT:
    batch = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10, WaitTimeSeconds=2).get("Messages", [])
    if not batch:
      break
    messages += len(batch)
  return {"s3_receipts": receipts, "dynamodb_records": records, "sqs_messages": messages}


def delete_resources(bucket: str, table: str, queue_url: str) -> None:
  """만든 리소스를 모두 지운다. 실제 AWS에서 돌렸을 때 비용이 남지 않게 한다."""
  s3, dynamodb, sqs = boto3.client("s3"), boto3.client("dynamodb"), boto3.client("sqs")
  for obj in s3.list_objects_v2(Bucket=bucket).get("Contents", []):
    s3.delete_object(Bucket=bucket, Key=obj["Key"])
  s3.delete_bucket(Bucket=bucket)
  dynamodb.delete_table(TableName=table)
  sqs.delete_queue(QueueUrl=queue_url)


def main() -> int:
  """어느 계정에 붙었는지 먼저 출력하고, 생성 → 주문 → 검증 → 삭제를 실행한다."""
  identity = boto3.client("sts").get_caller_identity()
  print(f"account    {identity['Account']} ({identity['Arn'].split(':')[-1]})")
  suffix = uuid.uuid4().hex[:8]
  with timed("total"):
    with timed("create"):
      resources = create_resources(suffix)
    try:
      with timed("orders"):
        place_orders(*resources)
      with timed("verify"):
        counts = verify(*resources)
    finally:
      with timed("delete"):
        delete_resources(*resources)
  print(f"result     {counts}")
  return 0 if all(v == ORDER_COUNT for v in counts.values()) else 1


if __name__ == "__main__":
  sys.exit(main())
