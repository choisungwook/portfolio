resource "aws_iam_role" "gateway" {
  name               = "${var.project_name}-gateway"
  assume_role_policy = data.aws_iam_policy_document.gateway_assume_role.json
}

resource "aws_iam_role_policy" "gateway" {
  name   = "web-search-connector"
  role   = aws_iam_role.gateway.id
  policy = data.aws_iam_policy_document.gateway_permissions.json
}
