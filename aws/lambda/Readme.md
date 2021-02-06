# 파일 업로드
* 준비: 존재하는 버킷 이름
* 예제: [파일업로드 예제 링크](s3_upload.py)
* 
```python
s3_client = boto3.client('s3')
s3_client.upload_file(src, bucket_name, dst)
```