# 관리형 노드그룹은 Bottlerocket ami_type이고 ami_id가 없으면 이 TOML에 settings.kubernetes(클러스터 이름, endpoint, CA)를 병합한다.
# 그래서 여기에는 클러스터 접속 설정을 넣지 않는다. motd는 병합 여부를 노드에서 확인하는 표식이다
locals {
  admin_container_enabled = var.admin_ssh_public_key != ""

  # admin container의 user-data는 SSH 설정 JSON을 base64로 한 번 더 감싼 값이다
  admin_container_user_data = base64encode(jsonencode({
    ssh = { "authorized-keys" = [var.admin_ssh_public_key] }
  }))

  bottlerocket_settings = <<-EOT
    [settings]
    motd = "bottlerocket handson: user data merged"

    [settings.host-containers.admin]
    enabled = ${local.admin_container_enabled}
    %{~if local.admin_container_enabled}
    user-data = "${local.admin_container_user_data}"
    %{~endif}
  EOT
}
