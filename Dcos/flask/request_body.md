# 개요
* flask에서 request_body를 가져오는 방법을 소개합니다.

<br>

# 상세내용
```python
from flask import Flask, request

app = Flask(__name__)

@app.route("/helloworld", methods=['GET'])
def helloworld():
    response = {
        'status': "",
        'error_msg': ""
    }

    request_body = request.get_json()
    print(request_body)

    return "Done"
```