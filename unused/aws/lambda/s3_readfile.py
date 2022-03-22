import boto3
import botocore

bucketname = 'boannews'
keyname = 'raw_news/20210206_news.txt'
unExisting_keyname = "abc.txt"

def test1():
    try:
        s3 = boto3.resource('s3')
        obj = s3.Object(bucketname, unExisting_keyname)
        body = obj.get()['Body'].read().decode()

        print(body)
    except s3.meta.client.exceptions.NoSuchKey:
        raise Exception ("Readfile From s3 is failed: {}/{}".format(bucketname, unExisting_keyname))

def test2():
    try:
        s3 = boto3.client('s3')
        data = s3.get_object(Bucket=bucketname, Key=unExisting_keyname)
        contents = data['Body'].read().decode()
        print(contents)
    except Exception as e:
        raise "Readfile From s3 is failed: {}".format(e)

test1()
test2()