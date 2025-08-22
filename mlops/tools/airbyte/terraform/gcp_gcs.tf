resource "google_storage_bucket" "akbun_airbyte_destination" {
  name          = "akbun-airbyte-destination-${random_id.bucket_suffix.hex}"
  location      = "ASIA-NORTHEAST3" # Seoul region
  force_destroy = true

  versioning {
    enabled = true
  }

  uniform_bucket_level_access = true

  labels = {
    name        = "akbun-airbyte-destination"
    environment = var.environment
    project     = var.project_name
  }
}

resource "google_storage_bucket_iam_member" "akbun_airbyte_destination_admin" {
  bucket = google_storage_bucket.akbun_airbyte_destination.name
  role   = "roles/storage.admin"
  member = "serviceAccount:${var.gcp_service_account_email}"
}

# Upload dummy CSV file to GCS for testing
resource "google_storage_bucket_object" "dummy_csv" {
  name   = "dummy.csv"
  bucket = google_storage_bucket.akbun_airbyte_destination.name
  source = "${path.module}/sample-data/dummy.csv"
}
