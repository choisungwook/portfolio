PUT http://127.0.0.1:{{server_port}}/cache/k
Content-Type: application/json
{
  "value": "v"
}
HTTP 204

GET http://127.0.0.1:{{server_port}}/cache/k
HTTP 200
[Asserts]
jsonpath "$.key" == "k"
jsonpath "$.value" == "v"
