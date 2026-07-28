resource "aws_iam_role" "ec2_ssm" {
  name = "${var.project_name}-ec2-ssm"

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

resource "aws_iam_role_policy_attachment" "ec2_ssm_core" {
  role       = aws_iam_role.ec2_ssm.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2_ssm" {
  name = "${var.project_name}-ec2-ssm"
  role = aws_iam_role.ec2_ssm.name
}

# The permissions custodian needs for policies/. Created but attached to nothing:
# read it, then decide what the principal running custodian should actually hold.
data "aws_iam_policy_document" "custodian" {
  statement {
    sid    = "Read"
    effect = "Allow"
    actions = [
      "ec2:Describe*",
      "rds:Describe*",
      "rds:ListTagsForResource",
      "cloudwatch:GetMetricStatistics",
      "tag:GetResources",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "TagAndPause"
    effect = "Allow"
    actions = [
      "ec2:CreateTags",
      "ec2:DeleteTags",
      "ec2:StartInstances",
      "ec2:StopInstances",
      "ec2:CreateSnapshot",
      "rds:AddTagsToResource",
      "rds:RemoveTagsFromResource",
      "rds:StartDBInstance",
      "rds:StopDBInstance",
    ]
    resources = ["*"]
  }

  # Deletion is allowed only on resources custodian already marked, so a
  # mistyped filter cannot delete something the mark step never saw.
  statement {
    sid    = "DeleteMarkedOnly"
    effect = "Allow"
    actions = [
      "ec2:DeleteVolume",
      "ec2:ReleaseAddress",
      "rds:DeleteDBSnapshot",
    ]
    resources = ["*"]

    condition {
      test     = "StringLike"
      variable = "aws:ResourceTag/c7n_orphan"
      values   = ["*"]
    }
  }
}

resource "aws_iam_policy" "custodian" {
  name        = "${var.project_name}-custodian"
  description = "Least privilege set for the policies in this lab. ec2:TerminateInstances is left out on purpose."
  policy      = data.aws_iam_policy_document.custodian.json
}
