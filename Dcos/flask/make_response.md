# 개요
* restapi를 작성할 때 응답 템플릿 만드는 방법을 소개합니다.

<br>

# 상세내용
* resapi응답은 http상태코드와 body를 전달해야 합니다.
* 이 2가지를 충족시키는 방법은 여러가지가 있습니다. 그 중 flask에서 제공하는 make_response를 이용하는 방법을 소개합니다.
* make_response는 2개 인자가 필요합니다.
  * 1번째 인자: json serialzie
  * 2번째 인자: http 상태코드
* 아래 예제는 request_body에서 hello가 없으면 bad_request(400)응답을 전송합니다. 반대로, hello가 있다면 200응답을 전송합니다.

```python
from flask import Flask, request, make_response, jsonify

app = Flask(__name__)

@app.route("/helloworld", methods=['GET'])
def helloworld():
    response = {
        'status': "",
        'error_msg': ""
    }

    request_body = request.get_json()
    if request_body.get('hello', None) == None:
        # bad request(400) 응답
        response['status'] = "failed"
        response['error_msg'] = str(e)
        status_code = 400
    else:
        response['status'] = "succ"
        status_code = 200

    return make_response(jsonify(response), status_code)
```