# Fargate task는 교체되면 로컬 디스크가 사라진다. 90일 metric과 Grafana 설정은 EFS에 둔다.
# VictoriaMetrics는 EFS 같은 NFS 저장소를 지원한다. Prometheus는 NFS를 지원하지 않으므로 Prometheus로 바꾸면 EBS가 필요하다.
resource "aws_efs_file_system" "observability" {
  encrypted        = true
  performance_mode = "generalPurpose"
  throughput_mode  = "elastic"

  tags = {
    Name = "${var.name}-observability"
  }
}

resource "aws_efs_mount_target" "observability" {
  for_each = toset(var.subnet_ids)

  file_system_id  = aws_efs_file_system.observability.id
  subnet_id       = each.value
  security_groups = [aws_security_group.efs.id]
}

resource "aws_efs_access_point" "victoriametrics" {
  file_system_id = aws_efs_file_system.observability.id

  posix_user {
    uid = 0
    gid = 0
  }

  root_directory {
    path = "/victoriametrics"

    creation_info {
      owner_uid   = 0
      owner_gid   = 0
      permissions = "0755"
    }
  }
}

# Grafana 이미지는 uid 472로 돈다.
resource "aws_efs_access_point" "grafana" {
  file_system_id = aws_efs_file_system.observability.id

  posix_user {
    uid = 472
    gid = 0
  }

  root_directory {
    path = "/grafana"

    creation_info {
      owner_uid   = 472
      owner_gid   = 0
      permissions = "0755"
    }
  }
}

resource "aws_ssm_parameter" "grafana_admin_password" {
  name  = "/${var.name}/grafana-admin-password"
  type  = "SecureString"
  value = var.grafana_admin_password
}

resource "aws_cloudwatch_log_group" "observability" {
  name              = "/${var.name}/observability"
  retention_in_days = 7
}
