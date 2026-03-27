resource "aws_iam_user" "this" {
  name = var.iam_username

  tags = {
    Name = var.iam_username
  }
}

resource "aws_iam_user_policy" "aws_login" {
  name = "${var.project_name}-aws-login"
  user = aws_iam_user.this.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowAWSLogin"
        Effect = "Allow"
        Action = [
          "signin:AuthorizeOAuth2Access",
          "signin:CreateOAuth2Token"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "read_only" {
  user       = aws_iam_user.this.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}
