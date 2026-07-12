resource "aws_iam_role" "ec2" {
  name = "${var.project_name}-ec2"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ec2.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

# SSM Session Manager 접속. 폐쇄망이라 bastion을 둘 public subnet 자체가 없어 유일한 접속 수단이다.
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# private ECR에서 LiteLLM 이미지를 pull하는 권한.
data "aws_iam_policy_document" "ecr_pull" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
    ]
    resources = [aws_ecr_repository.litellm.arn]
  }
}

resource "aws_iam_role_policy" "ecr_pull" {
  name   = "${var.project_name}-ecr-pull"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.ecr_pull.json
}

# Bedrock 호출 권한. 장기 API key 대신 instance role로 자격증명을 공급한다.
# APAC cross-region inference profile과 그 profile이 라우팅하는 foundation model 양쪽에 권한이 필요하다.
data "aws_iam_policy_document" "bedrock_invoke" {
  statement {
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]
    resources = [
      "arn:aws:bedrock:*::foundation-model/anthropic.*",
      "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:inference-profile/apac.anthropic.*",
    ]
  }
}

resource "aws_iam_role_policy" "bedrock_invoke" {
  name   = "${var.project_name}-bedrock-invoke"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.bedrock_invoke.json
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project_name}-ec2"
  role = aws_iam_role.ec2.name
}
