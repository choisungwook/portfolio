# 대칭(Symmetric) 키: 암호화/복호화에 같은 키를 사용
resource "aws_kms_key" "symmetric" {
  description = "${var.project_name} symmetric encryption key"
  # AWS KMS는 최소 7일의 삭제 대기 기간이 필요하므로 즉시 삭제는 지원되지 않음
  deletion_window_in_days = var.kms_deletion_window_in_days
  enable_key_rotation     = true
  rotation_period_in_days = 90

  tags = {
    Name = "${var.project_name}-symmetric-key"
  }
}

# KMS 키 별칭(Alias): 키 ID 대신 사람이 읽기 쉬운 이름으로 참조
resource "aws_kms_alias" "symmetric" {
  name          = "alias/${var.project_name}-symmetric"
  target_key_id = aws_kms_key.symmetric.key_id
}
