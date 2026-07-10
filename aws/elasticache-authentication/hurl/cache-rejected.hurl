GET http://127.0.0.1:{{server_port}}/cache/k
HTTP *
[Asserts]
status >= 500
status < 600
