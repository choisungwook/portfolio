# Get all files from dist directory
locals {
  dist_files = fileset("${path.module}/../dist", "**/*")

  # Define MIME types for common file extensions
  mime_types = {
    ".html"  = "text/html"
    ".css"   = "text/css"
    ".js"    = "application/javascript"
    ".json"  = "application/json"
    ".png"   = "image/png"
    ".jpg"   = "image/jpeg"
    ".jpeg"  = "image/jpeg"
    ".gif"   = "image/gif"
    ".svg"   = "image/svg+xml"
    ".ico"   = "image/x-icon"
    ".woff"  = "font/woff"
    ".woff2" = "font/woff2"
    ".ttf"   = "font/ttf"
    ".eot"   = "application/vnd.ms-fontobject"
  }
}

# Upload all files to S3
resource "aws_s3_object" "static_files" {
  for_each = local.dist_files

  bucket = aws_s3_bucket.static_website.bucket
  key    = each.value
  source = "${path.module}/../dist/${each.value}"

  # Set content type based on file extension
  content_type = lookup(
    local.mime_types,
    regex("\\.[^.]+$", each.value),
    "application/octet-stream"
  )

  # Generate etag based on file content
  etag = filemd5("${path.module}/../dist/${each.value}")

  # Cache control headers
  cache_control = can(regex("\\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$", each.value)) ? "public, max-age=31536000" : "public, max-age=3600"
}
