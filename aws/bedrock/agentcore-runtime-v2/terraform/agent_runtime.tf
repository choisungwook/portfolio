locals {
  # key: runtime 이름 접미사, value: platform_version. null이면 인자를 생략해 서비스 기본값을 따른다
  runtimes = {
    legacy  = var.legacy_platform_version
    v2      = "V2"
    default = null
  }
}

resource "aws_bedrockagentcore_agent_runtime" "this" {
  for_each = local.runtimes

  agent_runtime_name = "rtv2_${each.key}"
  role_arn           = aws_iam_role.runtime.arn
  platform_version   = each.value

  agent_runtime_artifact {
    container_configuration {
      container_uri = "${aws_ecr_repository.agent.repository_url}:${var.image_tag}"
    }
  }

  network_configuration {
    network_mode = "PUBLIC"
  }

  environment_variables = {
    INIT_SECONDS   = tostring(var.init_seconds)
    INIT_MEMORY_MB = tostring(var.init_memory_mb)
  }

  depends_on = [aws_iam_role_policy.runtime]
}
