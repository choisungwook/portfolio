# KMS(Key Management Service) 원리

이 프로젝트는 AWS KMS를 이용해서 간단히 암호화/복호화를 실습하는 핸즈온입니다. 특히 봉투암호화에 대해 다루는데, 이론적인 내용은 저의 블로그에 정리했습니다.

- 블로그 정리: https://malwareanalysis.tistory.com/906

## 예제 가이드

예제는 Python SDK(boto3)와 AWS CLI 두 가지 경로로 제공합니다.

- [Python 예제 가이드](./examples/python.md)
- [AWS CLI 예제 가이드](./examples/aws-cli.md)

## 참고자료

- https://docs.aws.amazon.com/kms/latest/developerguide/overview.html
- https://en.wikipedia.org/wiki/Envelope_encryption
