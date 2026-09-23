resource "aws_ssm_parameter" "master_key" {
  name  = "/${local.name}/litellm-master-key"
  type  = "SecureString"
  value = var.litellm_master_key
}

resource "aws_ssm_parameter" "database_url" {
  name  = "/${local.name}/database-url"
  type  = "SecureString"
  value = local.database_url
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/${local.name}/db-password"
  type  = "SecureString"
  value = var.db_password
}
