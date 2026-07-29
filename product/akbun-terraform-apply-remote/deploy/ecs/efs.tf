# state.json, PR checkout, 저장된 plan 파일을 담는 공유 스토리지.
# 새 task가 이 볼륨을 이어받아 이전 task의 lock과 plan 기록으로 기동한다.

resource "aws_efs_file_system" "data" {
  creation_token = "${var.project_name}-data"
  encrypted      = true

  tags = {
    Name = "${var.project_name}-data"
  }
}

resource "aws_efs_mount_target" "data" {
  for_each = toset(data.aws_subnets.default.ids)

  file_system_id  = aws_efs_file_system.data.id
  subnet_id       = each.value
  security_groups = [aws_security_group.efs.id]
}

resource "aws_efs_access_point" "data" {
  file_system_id = aws_efs_file_system.data.id

  posix_user {
    uid = 0
    gid = 0
  }

  root_directory {
    path = "/atr-data"

    creation_info {
      owner_uid   = 0
      owner_gid   = 0
      permissions = "700"
    }
  }
}
