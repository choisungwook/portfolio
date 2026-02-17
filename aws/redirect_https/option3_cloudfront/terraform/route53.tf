# Phase 1: S3 hosting domain → CloudFront
resource "aws_route53_record" "s3_hosting" {
  zone_id = var.route53_zone_id
  name    = var.s3_hosting_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

# Phase 2: Redirect source domain → same CloudFront
resource "aws_route53_record" "redirect_source" {
  count = var.enable_redirect ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.redirect_source_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}
