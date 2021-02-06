import json
import boto3
import os
from datetime import datetime

s3_resource = boto3.resource('s3')

def lambda_handler(event, context):
    bucket_name = "boannews"

    bucket_object = s3_resource.Bucket(bucket_name)

    for obj in bucket_object.objects.all():
        print(obj.key)