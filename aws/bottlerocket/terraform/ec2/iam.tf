resource "aws_iam_role" "bottlerocket" {
  name = "${var.project_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# control container 안의 SSM agent가 이 권한으로 Session Manager에 등록한다
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.bottlerocket.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "bottlerocket" {
  name = "${var.project_name}-profile"
  role = aws_iam_role.bottlerocket.name
}
