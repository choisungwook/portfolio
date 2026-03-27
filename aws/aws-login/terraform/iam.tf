resource "aws_iam_user" "this" {
  name = var.iam_username

  tags = {
    Name = var.iam_username
  }
}

resource "aws_iam_user_policy_attachment" "aws_login" {
  user       = aws_iam_user.this.name
  policy_arn = "arn:aws:iam::aws:policy/SignInLocalDevelopmentAccess"
}

resource "aws_iam_user_policy_attachment" "read_only" {
  user       = aws_iam_user.this.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}
