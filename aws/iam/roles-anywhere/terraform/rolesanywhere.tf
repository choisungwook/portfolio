resource "aws_rolesanywhere_trust_anchor" "lab" {
  name    = "${var.project_name}-ca"
  enabled = true
  source {
    source_type = "CERTIFICATE_BUNDLE"
    source_data {
      x509_certificate_data = file(var.ca_certificate_path)
    }
  }
}
resource "aws_rolesanywhere_profile" "lab" {
  name             = "${var.project_name}-profile"
  enabled          = true
  duration_seconds = 3600
  role_arns        = [aws_iam_role.client.arn]
}
