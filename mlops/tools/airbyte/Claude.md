# What is this proejct?

* this project is a practice for airbyte.

## Goal

* I don't know the airbyte at all. So, I would like to study about how airbyte works.
* I can understand of architecture of airbyte.
* I can update airbyte configuration using terraform. But, I must install airbyte using helm charts.

## Lab environment

* This Lab environment is a kubernetes.
* I use kind cluster using docker. I use a docker desktop on Macbook
* I use helmfile to install, upgrade, and delete Helm charts. The values for the Helm charts are in the charts directory

## Test scenario

* I used Airbyte to copy data from AWS S3 to GCP GCS. Both the S3 bucket and GCS bucket were created with Terraform. I am very familiar with AWS, but I have no experience with GCP, and I didn't select the sample data yet.

## requirements

* I live in south korea. So the region must be seoul.
* Data encryption should be enabled such as S3 SSE.
* All resource names and tags begin with "akbun-"
* Terraform code is in terraform directory.
