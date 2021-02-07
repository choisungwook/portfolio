import boto3

bucketname = 'boannews'
keyname = 'raw_news/20210206_news.txt'

def test1():
    s3 = boto3.resource('s3')
    obj = s3.Object(bucketname, keyname)
    body = obj.get()['Body'].read().decode()

    print(body)

def test2():
    s3 = boto3.client('s3')
    data = s3.get_object(Bucket=bucketname, Key=keyname)
    contents = data['Body'].read().decode()
    print(contents)

test1()
test2()