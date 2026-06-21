# GitHub connection은 이 예제에서 Terraform으로 만들지 않습니다.
# 처음 실습에서는 AWS console에서 GitHub authorization과 App installation을 직접 완료합니다.
#
# 참고용 Terraform 코드는 아래와 같습니다. 이 리소스로 connection ARN을 만들 수 있어도
# GitHub 쪽 연결을 완료하기 전에는 connection 상태가 PENDING일 수 있습니다.
#
# resource "aws_codeconnections_connection" "github" {
#   name          = "codebuild-github-connection"
#   provider_type = "GitHub"
# }
#
# output "github_connection_arn" {
#   value = aws_codeconnections_connection.github.arn
# }
