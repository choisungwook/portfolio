# CodeConnections connection을 Terraform으로 만든다.
# 주의: 생성 직후 상태는 PENDING이다. AWS console에서 GitHub authorization과
# AWS Connector for GitHub 설치를 완료해야 AVAILABLE로 바뀌고 build가 성공한다.
# 설치할 때 repo a와 repo b를 모두 선택해야 한다. b가 빠지면 build 안의 clone이 거부된다.
resource "aws_codeconnections_connection" "github" {
  name          = var.project_name
  provider_type = "GitHub"

  tags = {
    Environment = var.environment
  }
}
