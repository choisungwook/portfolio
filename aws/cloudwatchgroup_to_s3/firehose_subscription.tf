###############################################################################
# Method 2: CloudWatch Logs -> Subscription Filter -> Kinesis Data Firehose -> S3
###############################################################################

# Firehose IAM Role
resource "aws_iam_role" "firehose" {
  name = "${var.project_name}-firehose-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "firehose.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "firehose_s3" {
  name = "${var.project_name}-firehose-s3-policy"
  role = aws_iam_role.firehose.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:AbortMultipartUpload",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
          "s3:PutObject"
        ]
        Resource = [
          aws_s3_bucket.logs.arn,
          "${aws_s3_bucket.logs.arn}/firehose-logs/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.firehose_error.arn}:*"
      }
    ]
  })
}

# Firehose 에러 로그용 CloudWatch Log Group
resource "aws_cloudwatch_log_group" "firehose_error" {
  name              = "/${var.project_name}/firehose-error"
  retention_in_days = 1

  tags = {
    Name = "${var.project_name}-firehose-error-log-group"
  }
}

resource "aws_cloudwatch_log_stream" "firehose_error" {
  name           = "S3Delivery"
  log_group_name = aws_cloudwatch_log_group.firehose_error.name
}

# Kinesis Data Firehose Delivery Stream
resource "aws_kinesis_firehose_delivery_stream" "logs" {
  name        = "${var.project_name}-log-stream"
  destination = "extended_s3"

  extended_s3_configuration {
    role_arn   = aws_iam_role.firehose.arn
    bucket_arn = aws_s3_bucket.logs.arn
    prefix     = "firehose-logs/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/hour=!{timestamp:HH}/"

    error_output_prefix = "firehose-errors/!{firehose:error-output-type}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/"

    buffering_size     = 1
    buffering_interval = 60

    cloudwatch_logging_options {
      enabled         = true
      log_group_name  = aws_cloudwatch_log_group.firehose_error.name
      log_stream_name = aws_cloudwatch_log_stream.firehose_error.name
    }
  }

  tags = {
    Name = "${var.project_name}-log-stream"
  }
}

# CloudWatch Logs -> Firehose 연결을 위한 IAM Role
resource "aws_iam_role" "cloudwatch_to_firehose" {
  name = "${var.project_name}-cw-to-firehose-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "logs.${data.aws_region.current.name}.amazonaws.com"
        }
        Condition = {
          StringLike = {
            "aws:SourceArn" = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "cloudwatch_to_firehose" {
  name = "${var.project_name}-cw-to-firehose-policy"
  role = aws_iam_role.cloudwatch_to_firehose.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "firehose:PutRecord",
          "firehose:PutRecordBatch"
        ]
        Resource = aws_kinesis_firehose_delivery_stream.logs.arn
      }
    ]
  })
}

# Subscription Filter - Firehose 방식
resource "aws_cloudwatch_log_subscription_filter" "firehose" {
  name            = "${var.project_name}-firehose-filter"
  log_group_name  = aws_cloudwatch_log_group.app.name
  filter_pattern  = ""
  destination_arn = aws_kinesis_firehose_delivery_stream.logs.arn
  role_arn        = aws_iam_role.cloudwatch_to_firehose.arn
}
