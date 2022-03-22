import json
import boto3
import os
from datetime import datetime

s3_client = boto3.client('s3')

def lambda_handler(event, context):
    bucket_name = "boannews"
    
    now = datetime.now().strftime("%Y%m%d")
    
    save_path = "/tmp/t.txt"
    with open(save_path, 'w') as f:
        f.write('hello world')
        
    s3_client.upload_file(save_path, bucket_name, 'news/t.txt')
    
    return {
        'statusCode': 200,
        'body': json.dumps('Hello from Lambda!')
    }