data "aws_route53_zone" "main" {
  zone_id = var.route53_hosted_zone_id
}

# Public frontend domain pointing to CloudFront
resource "aws_route53_record" "public_frontend" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "public-frontend.choilab.xyz"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.static_website.domain_name
    zone_id                = aws_cloudfront_distribution.static_website.hosted_zone_id
    evaluate_target_health = false
  }
}

# Ref: https://github.com/hashicorp/terraform-provider-aws/issues/21845
resource "aws_route53_record" "private_frontend" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.s3_bucket_name
  type    = "A"
  alias {
    name                   = aws_vpc_endpoint.s3_private.dns_entry[0].dns_name
    zone_id                = aws_vpc_endpoint.s3_private.dns_entry[0].hosted_zone_id
    evaluate_target_health = true
  }
}
