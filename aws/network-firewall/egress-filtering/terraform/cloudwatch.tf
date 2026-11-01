# Log groups for the firewall that is created in the console.
# Created here so terraform destroy also removes them.
resource "aws_cloudwatch_log_group" "firewall" {
  for_each = toset(["alert", "flow"])

  name              = "/aws/network-firewall/${var.project_name}/${each.key}"
  retention_in_days = 1
}

data "aws_caller_identity" "current" {}

# Without this, enabling logging appends these log groups to the shared
# AWSLogDeliveryWrite20150319 account policy, and destroy does not undo it.
resource "aws_cloudwatch_log_resource_policy" "firewall" {
  policy_name = "${var.project_name}-firewall-logs"

  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "delivery.logs.amazonaws.com" }
      Action    = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource  = [for lg in aws_cloudwatch_log_group.firewall : "${lg.arn}:*"]
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        ArnLike      = { "aws:SourceArn" = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*" }
      }
    }]
  })
}
