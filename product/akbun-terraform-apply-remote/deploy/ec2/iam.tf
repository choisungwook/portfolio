data "aws_iam_policy_document" "assume_ec2" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "server" {
  name               = var.project_name
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
}

# SSM Session Manager 접속용. SSH를 열지 않는다.
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.server.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "read_secrets" {
  statement {
    actions = ["ssm:GetParameter"]
    resources = [
      aws_ssm_parameter.webhook_secret.arn,
      aws_ssm_parameter.github_token.arn,
    ]
  }
}

resource "aws_iam_role_policy" "read_secrets" {
  name   = "read-secrets"
  role   = aws_iam_role.server.id
  policy = data.aws_iam_policy_document.read_secrets.json
}

# 서버 안의 terraform이 AWS 리소스를 만들 때 쓰는 권한.
# 실습 편의로 PowerUserAccess를 붙인다. 운영에서는 관리 대상 리소스에 맞게 좁힌다.
resource "aws_iam_role_policy_attachment" "terraform_runner" {
  role       = aws_iam_role.server.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

resource "aws_iam_instance_profile" "server" {
  name = var.project_name
  role = aws_iam_role.server.name
}
