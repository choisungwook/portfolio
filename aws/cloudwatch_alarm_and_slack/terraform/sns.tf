resource "aws_sns_topic" "rds_alarms_topic" {
  name = "${var.environment_name}-rds-alarms-topic"
  tags = var.common_tags
  # kms_master_key_id = "alias/aws/sns" # Enables at-reset encryption - Replaced with CMK
  kms_master_key_id = aws_kms_key.sns_topic_key.arn

  lambda_success_feedback_role_arn    = aws_iam_role.sns_delivery_status_role.arn
  lambda_failure_feedback_role_arn    = aws_iam_role.sns_delivery_status_role.arn
  lambda_success_feedback_sample_rate = "100" # Log all successful deliveries
}

resource "aws_sns_topic_subscription" "lambda_subscription" {
  topic_arn = aws_sns_topic.rds_alarms_topic.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.slack_notifier.arn
}

resource "aws_lambda_permission" "sns_invoke_lambda" {
  statement_id  = "AllowSNSToInvokeLambda"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.slack_notifier.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.rds_alarms_topic.arn
}

resource "aws_cloudwatch_log_group" "sns_delivery_status_logs" {
  name              = "/aws/sns/${var.environment_name}-rds-alarms-topic-delivery-status"
  retention_in_days = 1
  tags              = var.common_tags
}

resource "aws_iam_role" "sns_delivery_status_role" {
  name = "${var.environment_name}-sns-delivery-status-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
      }
    ]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy" "sns_delivery_status_policy" {
  name = "${var.environment_name}-sns-delivery-status-policy"
  role = aws_iam_role.sns_delivery_status_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:PutMetricFilter",
          "logs:PutRetentionPolicy"
        ]
        Effect   = "Allow"
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_kms_key" "sns_topic_key" {
  description             = "KMS key for encrypting the SNS topic ${var.environment_name}-rds-alarms-topic"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.sns_kms_key_policy.json
  tags                    = var.common_tags
}

resource "aws_kms_alias" "sns_topic_key_alias" {
  name          = "alias/${var.environment_name}/sns-rds-alarms"
  target_key_id = aws_kms_key.sns_topic_key.id
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "sns_kms_key_policy" {
  statement {
    sid    = "Enable IAM User Permissions and Key Administration"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
    actions   = ["kms:*"]
    resources = ["*"] # This policy applies to the KMS key itself
  }

  statement {
    sid    = "Allow SNS to use the key"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }
    actions = [
      "kms:GenerateDataKey*",
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:ReEncrypt*",
      "kms:DescribeKey"
    ]
    resources = ["*"] # Refers to this key
  }

  statement {
    sid    = "Allow CloudWatch Alarms to use the key for publishing to SNS"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
    actions = [
      "kms:GenerateDataKey*",
      "kms:Decrypt"
    ]
    resources = ["*"] # Refers to this key
  }
}

resource "aws_sns_topic_policy" "rds_alarms_topic_policy" {
  arn = aws_sns_topic.rds_alarms_topic.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.rds_alarms_topic.arn
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudwatch_metric_alarm.rds_cpu_high.arn
          }
        }
      }
    ]
  })
}
