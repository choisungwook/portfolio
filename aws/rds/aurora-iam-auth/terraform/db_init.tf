# 마이그레이션 전 상태(password 방식 app_pw 사용자와 샘플 테이블)를 만든다.
# apply하는 PC에서 mysql client로 접속하므로 Aurora security group에 내 IP가 열려 있어야 한다.
resource "terraform_data" "db_init" {
  triggers_replace = [aws_rds_cluster_instance.writer.id]

  provisioner "local-exec" {
    command = "${path.module}/../scripts/db-init.sh"
    environment = {
      AWS_REGION     = var.aws_region
      DB_HOST        = aws_rds_cluster.aurora.endpoint
      DB_NAME        = var.db_name
      SECRET_ARN     = aws_rds_cluster.aurora.master_user_secret[0].secret_arn
      PASSWORD_PARAM = aws_ssm_parameter.app_password.name
      PW_USER        = local.password_db_user
    }
  }

  depends_on = [aws_vpc_security_group_ingress_rule.db_from_me]
}
