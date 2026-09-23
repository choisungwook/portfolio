# 모듈은 cluster creator에게 admin 권한을 주지 않는다. terraform을 실행한 role을 access entry로 넘긴다
data "aws_caller_identity" "current" {}

data "aws_iam_session_context" "current" {
  arn = data.aws_caller_identity.current.arn
}
