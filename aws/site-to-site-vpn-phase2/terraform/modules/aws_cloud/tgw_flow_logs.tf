resource "aws_cloudwatch_log_group" "tgw_flow_logs" {
  name              = "/aws/tgw/${var.project_name}-flow-logs"
  retention_in_days = 7

  tags = {
    Name    = "${var.project_name}-tgw-flow-logs"
    Project = var.project_name
  }
}

resource "aws_iam_role" "tgw_flow_logs" {
  name = "${var.project_name}-tgw-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Project = var.project_name
  }
}

resource "aws_iam_role_policy" "tgw_flow_logs" {
  name = "${var.project_name}-tgw-flow-logs-policy"
  role = aws_iam_role.tgw_flow_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Effect   = "Allow"
        Resource = "*"
      }
    ]
  })
}

resource "aws_flow_log" "tgw" {
  transit_gateway_id       = aws_ec2_transit_gateway.this.id
  log_destination          = aws_cloudwatch_log_group.tgw_flow_logs.arn
  traffic_type             = "ALL"
  iam_role_arn             = aws_iam_role.tgw_flow_logs.arn
  max_aggregation_interval = 60

  tags = {
    Name    = "${var.project_name}-tgw-flow-log"
    Project = var.project_name
  }
}
