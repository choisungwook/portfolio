# 파일 업로드
* 준비: 존재하는 버킷 이름
* 예제: [예제 링크](s3_upload.py)
* 핵심 소스코드
 
```python
s3_client = boto3.client('s3')
s3_client.upload_file(src, bucket_name, dst)
```

# 참고자료
* [1] 블로그-boto3 client, resource 설명- https://planbs.tistory.com/entry/boto3resource%EC%99%80-boto3client%EC%9D%98-%EC%B0%A8%EC%9D%B4