# 클러스터가 없으므로 settings.kubernetes를 넣지 않는다. kubelet은 시작하지 못하지만 host와 host container는 동작한다
locals {
  admin_container_enabled = var.admin_ssh_public_key != ""

  admin_container_user_data = base64encode(jsonencode({
    ssh = { "authorized-keys" = [var.admin_ssh_public_key] }
  }))

  bottlerocket_settings = <<-EOT
    [settings]
    motd = "bottlerocket handson: standalone ec2"

    [settings.host-containers.admin]
    enabled = ${local.admin_container_enabled}
    %{~if local.admin_container_enabled}
    user-data = "${local.admin_container_user_data}"
    %{~endif}
  EOT
}
