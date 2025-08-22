output "s3_bucket_name" {
  description = "Name of the created S3 bucket"
  value       = aws_s3_bucket.akbun_airbyte_source.bucket
}

output "s3_bucket_arn" {
  description = "ARN of the created S3 bucket"
  value       = aws_s3_bucket.akbun_airbyte_source.arn
}

output "s3_bucket_region" {
  description = "Region of the created S3 bucket"
  value       = aws_s3_bucket.akbun_airbyte_source.region
}

output "gcs_bucket_name" {
  description = "Name of the created GCS bucket"
  value       = google_storage_bucket.akbun_airbyte_destination.name
}

output "gcs_bucket_url" {
  description = "URL of the created GCS bucket"
  value       = google_storage_bucket.akbun_airbyte_destination.url
}

output "gcs_bucket_location" {
  description = "Location of the created GCS bucket"
  value       = google_storage_bucket.akbun_airbyte_destination.location
}
