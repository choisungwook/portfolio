data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "ec2_ssm" {
  name               = "${var.project_name}-ec2-ssm"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = {
    Environment = var.environment
  }
}

# SSH를 열지 않고 SSM Session Manager로 접속한다.
resource "aws_iam_role_policy_attachment" "ec2_ssm_core" {
  role       = aws_iam_role.ec2_ssm.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# custom credential helper가 실습용 토큰을 읽을 때 쓰는 권한이다.
# helper가 파일이 아니라 외부 저장소에서 그때그때 가져오는 구조를 만들기 위한 것이다.
data "aws_iam_policy_document" "token_read" {
  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.token_parameter_name}"]
  }
}

resource "aws_iam_role_policy" "token_read" {
  name   = "${var.project_name}-token-read"
  role   = aws_iam_role.ec2_ssm.id
  policy = data.aws_iam_policy_document.token_read.json
}

resource "aws_iam_instance_profile" "ec2_ssm" {
  name = "${var.project_name}-ec2-ssm"
  role = aws_iam_role.ec2_ssm.name
}
