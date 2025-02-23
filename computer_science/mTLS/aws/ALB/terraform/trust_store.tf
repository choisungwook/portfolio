resource "aws_lb_trust_store" "client_ca" {
  name = "mtls-trust-store"

  ca_certificates_bundle_s3_bucket         = aws_s3_bucket.trust_store.id
  ca_certificates_bundle_s3_key            = "certs/root_ca.pem" # Your CA bundle file in S3
  ca_certificates_bundle_s3_object_version = aws_s3_object.ca_cert.version_id

  tags = {
    Name        = "mtls-trust-store"
    environment = "test"
  }

  depends_on = [aws_s3_object.ca_cert]
}

resource "aws_lb_trust_store_revocation" "this" {
  for_each = { for k, v in var.revocation_lists : k => v }

  trust_store_arn               = aws_lb_trust_store.client_ca.arn
  revocations_s3_bucket         = aws_s3_bucket.crl_store.id
  revocations_s3_key            = each.value.revocations_s3_key
  revocations_s3_object_version = aws_s3_object.crl_file[each.key].version_id
}
