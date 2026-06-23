data "aws_iam_policy_document" "external_secrets_assume_role" {
  statement {
    effect = "Allow"

    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [var.eks_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${var.eks_oidc_provider_url_without_https}:sub"
      values = [
        "system:serviceaccount:${var.external_secrets_namespace}:${var.external_secrets_service_account_name}",
      ]
    }

    condition {
      test     = "StringEquals"
      variable = "${var.eks_oidc_provider_url_without_https}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "external_secrets" {
  name               = "${var.project_name}-external-secrets"
  assume_role_policy = data.aws_iam_policy_document.external_secrets_assume_role.json

  tags = {
    Name = "${var.project_name}-external-secrets"
  }
}

data "aws_iam_policy_document" "external_secrets_read_secret" {
  statement {
    effect = "Allow"

    actions = [
      "secretsmanager:DescribeSecret",
      "secretsmanager:GetSecretValue",
      "secretsmanager:ListSecretVersionIds",
    ]

    resources = [aws_secretsmanager_secret.demo.arn]
  }
}

resource "aws_iam_policy" "external_secrets_read_secret" {
  name   = "${var.project_name}-read-secret"
  policy = data.aws_iam_policy_document.external_secrets_read_secret.json
}

resource "aws_iam_role_policy_attachment" "external_secrets_read_secret" {
  role       = aws_iam_role.external_secrets.name
  policy_arn = aws_iam_policy.external_secrets_read_secret.arn
}
