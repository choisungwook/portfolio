# platformVersion을 생략하면 API가 V1으로 만들므로 V2를 명시한다
resource "aws_bedrockagentcore_agent_runtime" "agent" {
  agent_runtime_name = "rtv2_v2"
  role_arn           = aws_iam_role.runtime.arn
  platform_version   = "V2"

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
