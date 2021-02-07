# 개요
* python기반 boto3 package 사용

<br>

# boto3 패키지 인터페이스
* low-level 인터페이스: boto3.client('s3')
* high-level 인터페이스: boto3.resource('s3')

<br>

# 버킷에 파일 업로드
* 준비: 존재하는 버킷 이름
* 예제: [예제 링크](s3_upload.py)
* 핵심 소스코드
 
```python
s3_client = boto3.client('s3')
s3_client.upload_file(src, bucket_name, dst)
```

<br>

# 버킷 리스트 출력
* 준비: 존재하는 버킷 이름
* 예제: [예제 링크](s3_upload.py)
* 핵심 소스코드

```python
bucket_name = "boannews"
bucket_object = s3_resource.Bucket(bucket_name)

for obj in bucket_object.objects.all():
    print(obj.key)
```

<br>

# 버킷 파일 읽기
* 준비: 존재하는 버킷과 파일이름
* 예제: [예제 링크](s3_readfile.py))
* 핵심 소스코드

```python
bucket_name = "boannews"
keyname = 'raw_news/20210206_news.txt'
bucket_object = s3_resource.Bucket(bucket_name)

s3 = boto3.resource('s3')
obj = s3.Object(bucketname, keyname)
body = obj.get()['Body'].read().decode()
```

# 참고자료
* [1] [블로그](https://planbs.tistory.com/entry/boto3resource%EC%99%80-boto3client%EC%9D%98-%EC%B0%A8%EC%9D%B4) - boto3 client, resource 설명- 