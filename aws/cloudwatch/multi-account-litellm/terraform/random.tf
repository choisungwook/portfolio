# 실습용 비밀값. terraform state에만 남고 파일로 쓰지 않는다.
resource "random_password" "litellm_master_key" {
  length  = 32
  special = false
}

resource "random_password" "db_password" {
  length  = 24
  special = false
}
