# session 단위 vCPU·메모리 사용량(USAGE_LOGS)을 1초 단위로 CloudWatch Logs에 보낸다
resource "aws_cloudwatch_log_group" "usage" {
  name              = "/aws/vendedlogs/bedrock-agentcore/${var.project_name}/usage"
  retention_in_days = 1
}

# 전용 resource policy가 없으면 CreateDelivery가 계정 공용 정책에 log group을 덧붙이고 destroy가 되돌리지 않는다
data "aws_iam_policy_document" "usage_delivery" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.usage.arn}:log-stream:*"]

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_cloudwatch_log_resource_policy" "usage_delivery" {
  policy_name     = "${var.project_name}-usage-delivery"
  policy_document = data.aws_iam_policy_document.usage_delivery.json
}

resource "aws_cloudwatch_log_delivery_destination" "usage" {
  name = "${var.project_name}-usage"

  delivery_destination_configuration {
    destination_resource_arn = aws_cloudwatch_log_group.usage.arn
  }
}

resource "aws_cloudwatch_log_delivery_source" "usage" {
  for_each = aws_bedrockagentcore_agent_runtime.agent

  name         = "${var.project_name}-${each.key}-usage"
  log_type     = "USAGE_LOGS"
  resource_arn = each.value.agent_runtime_arn
}

resource "aws_cloudwatch_log_delivery" "usage" {
  for_each = aws_cloudwatch_log_delivery_source.usage

  delivery_source_name     = each.value.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.usage.arn

  depends_on = [aws_cloudwatch_log_resource_policy.usage_delivery]
}
