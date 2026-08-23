data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "aws_iam_policy_document" "gateway_assume_role" {
  statement {
    sid     = "AllowAgentCoreToAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["bedrock-agentcore.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values = [
        "arn:${data.aws_partition.current.partition}:bedrock-agentcore:${var.aws_region}:${data.aws_caller_identity.current.account_id}:gateway/*"
      ]
    }
  }
}

data "aws_iam_policy_document" "gateway_permissions" {
  statement {
    sid       = "InvokeWebSearch"
    effect    = "Allow"
    actions   = ["bedrock-agentcore:InvokeWebSearch"]
    resources = ["arn:${data.aws_partition.current.partition}:bedrock-agentcore:${var.aws_region}:aws:tool/web-search.v1"]
  }
}

data "aws_iam_policy_document" "caller_permissions" {
  statement {
    sid       = "InvokeWebSearchGateway"
    effect    = "Allow"
    actions   = ["bedrock-agentcore:InvokeGateway"]
    resources = [aws_bedrockagentcore_gateway.web_search.gateway_arn]
  }
}
