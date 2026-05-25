# =========== EKS Pod Identity common assume role ===========

data "aws_iam_policy_document" "pod_identity_assume_role" {
  statement {
    sid = "AllowEksPodIdentity"
    actions = [
      "sts:AssumeRole",
      "sts:TagSession",
    ]

    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
  }
}

# =========== EBS CSI add-on ===========

resource "aws_iam_role" "ebs_csi_controller" {
  name               = "app-${var.eks_cluster_name}-ebs-csi-controller"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ebs_csi_controller" {
  role       = aws_iam_role.ebs_csi_controller.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

# =========== EFS CSI add-on for S3 Files ===========

resource "aws_iam_role" "efs_csi_controller" {
  name               = "app-${var.eks_cluster_name}-efs-csi-controller"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_assume_role.json
}

resource "aws_iam_role_policy_attachment" "efs_csi_controller" {
  role       = aws_iam_role.efs_csi_controller.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonS3FilesCSIDriverPolicy"
}

resource "aws_iam_role" "efs_csi_node" {
  name               = "app-${var.eks_cluster_name}-efs-csi-node"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_assume_role.json
}

resource "aws_iam_role_policy_attachment" "efs_csi_node_s3" {
  role       = aws_iam_role.efs_csi_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"
}

resource "aws_iam_role_policy_attachment" "efs_csi_node_s3files_client" {
  role       = aws_iam_role.efs_csi_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FilesClientFullAccess"
}

resource "aws_iam_role_policy_attachment" "efs_csi_node_utils" {
  role       = aws_iam_role.efs_csi_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonElasticFileSystemsUtils"
}

# =========== AWS Load Balancer Controller IRSA ===========

data "aws_iam_policy_document" "alb_controller_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(module.eks.oidc_provider_url, "https://", "")}:sub"
      values   = ["system:serviceaccount:kube-system:app-alb-controller-irsa-sa"]
    }
  }
}

resource "aws_iam_role" "alb_controller" {
  name               = "app-${var.eks_cluster_name}-alb-controller-irsa"
  assume_role_policy = data.aws_iam_policy_document.alb_controller_assume_role.json
}

resource "aws_iam_policy" "alb_controller" {
  name   = "app-${var.eks_cluster_name}-alb-controller-irsa-policy"
  policy = data.aws_iam_policy_document.alb_controller.json
}

data "aws_iam_policy_document" "alb_controller" {
  statement {
    actions = [
      "ec2:AuthorizeSecurityGroupIngress",
      "ec2:CreateSecurityGroup",
      "ec2:CreateTags",
      "ec2:DeleteSecurityGroup",
      "ec2:DeleteTags",
      "ec2:DescribeAccountAttributes",
      "ec2:DescribeAddresses",
      "ec2:DescribeAvailabilityZones",
      "ec2:DescribeCoipPools",
      "ec2:DescribeInstances",
      "ec2:DescribeInternetGateways",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeSubnets",
      "ec2:DescribeTags",
      "ec2:DescribeVpcPeeringConnections",
      "ec2:DescribeVpcs",
      "ec2:GetCoipPoolUsage",
      "ec2:GetSecurityGroupsForVpc",
      "ec2:RevokeSecurityGroupIngress",
    ]
    resources = ["*"]
  }

  statement {
    actions = [
      "elasticloadbalancing:AddListenerCertificates",
      "elasticloadbalancing:AddTags",
      "elasticloadbalancing:CreateListener",
      "elasticloadbalancing:CreateLoadBalancer",
      "elasticloadbalancing:CreateRule",
      "elasticloadbalancing:CreateTargetGroup",
      "elasticloadbalancing:DeleteListener",
      "elasticloadbalancing:DeleteLoadBalancer",
      "elasticloadbalancing:DeleteRule",
      "elasticloadbalancing:DeleteTargetGroup",
      "elasticloadbalancing:DeregisterTargets",
      "elasticloadbalancing:DescribeCapacityReservation",
      "elasticloadbalancing:DescribeListenerAttributes",
      "elasticloadbalancing:DescribeListenerCertificates",
      "elasticloadbalancing:DescribeListeners",
      "elasticloadbalancing:DescribeLoadBalancerAttributes",
      "elasticloadbalancing:DescribeLoadBalancers",
      "elasticloadbalancing:DescribeRules",
      "elasticloadbalancing:DescribeSSLPolicies",
      "elasticloadbalancing:DescribeTags",
      "elasticloadbalancing:DescribeTargetGroupAttributes",
      "elasticloadbalancing:DescribeTargetGroups",
      "elasticloadbalancing:DescribeTargetHealth",
      "elasticloadbalancing:ModifyCapacityReservation",
      "elasticloadbalancing:ModifyIpPools",
      "elasticloadbalancing:ModifyListener",
      "elasticloadbalancing:ModifyListenerAttributes",
      "elasticloadbalancing:ModifyLoadBalancerAttributes",
      "elasticloadbalancing:ModifyRule",
      "elasticloadbalancing:ModifyTargetGroup",
      "elasticloadbalancing:ModifyTargetGroupAttributes",
      "elasticloadbalancing:RegisterTargets",
      "elasticloadbalancing:RemoveListenerCertificates",
      "elasticloadbalancing:RemoveTags",
      "elasticloadbalancing:SetIpAddressType",
      "elasticloadbalancing:SetRulePriorities",
      "elasticloadbalancing:SetSecurityGroups",
      "elasticloadbalancing:SetSubnets",
      "elasticloadbalancing:SetWebAcl",
    ]
    resources = ["*"]
  }

  statement {
    actions = [
      "acm:DescribeCertificate",
      "acm:ListCertificates",
      "cognito-idp:DescribeUserPoolClient",
      "shield:CreateProtection",
      "shield:DeleteProtection",
      "shield:DescribeProtection",
      "shield:GetSubscriptionState",
      "waf-regional:AssociateWebACL",
      "waf-regional:DisassociateWebACL",
      "waf-regional:GetWebACL",
      "waf-regional:GetWebACLForResource",
      "wafv2:AssociateWebACL",
      "wafv2:DisassociateWebACL",
      "wafv2:GetWebACL",
      "wafv2:GetWebACLForResource",
    ]
    resources = ["*"]
  }

  statement {
    actions = [
      "iam:GetServerCertificate",
      "iam:ListServerCertificates",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy_attachment" "alb_controller" {
  role       = aws_iam_role.alb_controller.name
  policy_arn = aws_iam_policy.alb_controller.arn
}

# =========== S3 Files bucket access ===========

data "aws_iam_policy_document" "s3files_assume_role" {
  statement {
    sid     = "AllowS3FilesAssumeRole"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["elasticfilesystem.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values = [
        "arn:${data.aws_partition.current.partition}:s3files:${var.aws_region}:${data.aws_caller_identity.current.account_id}:file-system/*"
      ]
    }
  }
}

resource "aws_iam_role" "s3files_bucket_access" {
  name               = "${var.eks_cluster_name}-s3files-bucket-access"
  assume_role_policy = data.aws_iam_policy_document.s3files_assume_role.json
}

data "aws_iam_policy_document" "s3files_bucket_access" {
  statement {
    sid = "S3BucketPermissions"
    actions = [
      "s3:ListBucket",
      "s3:ListBucketVersions",
    ]
    resources = [aws_s3_bucket.artifacts.arn]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid = "S3ObjectPermissions"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:DeleteObject*",
      "s3:GetObject*",
      "s3:List*",
      "s3:PutObject*",
    ]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid = "EventBridgeManage"
    actions = [
      "events:DeleteRule",
      "events:DisableRule",
      "events:EnableRule",
      "events:PutRule",
      "events:PutTargets",
      "events:RemoveTargets",
    ]
    resources = ["arn:${data.aws_partition.current.partition}:events:*:*:rule/DO-NOT-DELETE-S3-Files*"]

    condition {
      test     = "StringEquals"
      variable = "events:ManagedBy"
      values   = ["elasticfilesystem.amazonaws.com"]
    }
  }

  statement {
    sid = "EventBridgeRead"
    actions = [
      "events:DescribeRule",
      "events:ListRuleNamesByTarget",
      "events:ListRules",
      "events:ListTargetsByRule",
    ]
    resources = ["arn:${data.aws_partition.current.partition}:events:*:*:rule/*"]
  }
}

resource "aws_iam_role_policy" "s3files_bucket_access" {
  name   = "${var.eks_cluster_name}-s3files-bucket-access"
  role   = aws_iam_role.s3files_bucket_access.id
  policy = data.aws_iam_policy_document.s3files_bucket_access.json
}
