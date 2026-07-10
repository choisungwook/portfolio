data "aws_iam_policy_document" "app_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name_prefix        = "${var.project_name}-app-"
  assume_role_policy = data.aws_iam_policy_document.app_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# The IAM Spring Boot client signs its connection token with the instance role,
# so the role needs elasticache:Connect on the replication group and IAM user.
data "aws_iam_policy_document" "elasticache_connect" {
  statement {
    actions = ["elasticache:Connect"]
    resources = [
      "arn:aws:elasticache:${var.aws_region}:${data.aws_caller_identity.current.account_id}:replicationgroup:${var.project_name}",
      "arn:aws:elasticache:${var.aws_region}:${data.aws_caller_identity.current.account_id}:user:${var.iam_user_name}",
    ]
  }
}

resource "aws_iam_role_policy" "elasticache_connect" {
  name   = "${var.project_name}-elasticache-connect"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.elasticache_connect.json
}

resource "aws_iam_instance_profile" "app" {
  name_prefix = "${var.project_name}-app-"
  role        = aws_iam_role.app.name
}
