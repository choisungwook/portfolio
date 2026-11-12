# /// script
# requires-python = ">=3.12"
# dependencies = ["boto3==1.44.1"]
# ///
"""일부러 틀린 요청을 보내고 오류 코드, HTTP 상태, 메시지를 한 줄씩 출력한다.

emulator와 실제 AWS에서 각각 실행해 출력을 diff하면 오류 fidelity를 눈으로 비교할 수 있다.
리소스를 만들지 않는 호출만 쓰므로 실제 AWS에서 돌려도 남는 것이 없다.
"""
import boto3
from botocore.exceptions import ClientError

MISSING = "aws-emulator-handson-does-not-exist"


def cases() -> list[tuple[str, callable]]:
  """(이름, 실행 함수) 목록을 반환한다. 모두 오류가 나야 하는 호출이다."""
  s3, dynamodb, sqs = boto3.client("s3"), boto3.client("dynamodb"), boto3.client("sqs")
  secrets, iam = boto3.client("secretsmanager"), boto3.client("iam")
  return [
    ("dynamodb-short-table-name", lambda: dynamodb.create_table(
      TableName="ab", BillingMode="PAY_PER_REQUEST",
      AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
      KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}])),
    ("dynamodb-put-missing-table", lambda: dynamodb.put_item(TableName=MISSING, Item={"id": {"S": "1"}})),
    ("s3-get-missing-bucket", lambda: s3.get_object(Bucket=MISSING, Key="a.txt")),
    ("s3-invalid-bucket-name", lambda: s3.create_bucket(
      Bucket="Bad_Bucket_Name", CreateBucketConfiguration={"LocationConstraint": s3.meta.region_name})),
    ("sqs-missing-queue", lambda: sqs.get_queue_url(QueueName=MISSING)),
    ("secrets-missing-secret", lambda: secrets.get_secret_value(SecretId=MISSING)),
    ("iam-tag-missing-mfa-device", lambda: iam.tag_mfa_device(
      SerialNumber=f"arn:aws:iam::{boto3.client('sts').get_caller_identity()['Account']}:mfa/{MISSING}",
      Tags=[{"Key": "k", "Value": "v"}])),
  ]


def describe(error: ClientError) -> str:
  """오류에서 비교할 세 값(HTTP 상태, 코드, 메시지)을 꺼낸다. 메시지 안의 계정 ID는 지운다."""
  status = error.response["ResponseMetadata"]["HTTPStatusCode"]
  code = error.response["Error"].get("Code")
  message = error.response["Error"].get("Message", "")
  account = boto3.client("sts").get_caller_identity()["Account"]
  return f"{status} {code} | {message.replace(account, '<account>')[:110]}"


if __name__ == "__main__":
  for name, call in cases():
    try:
      call()
      print(f"{name:<28} NO ERROR")
    except ClientError as error:
      print(f"{name:<28} {describe(error)}")
