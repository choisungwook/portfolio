up:
	@docker run -d --rm --name httpbin -p 8000:80 kong/httpbin:0.2.1
	@docker run --rm -d -v $(pwd)/config.yaml:/etc/envoy/envoy.yaml -p 10000:10000 --name envoy envoyproxy/envoy:v1.31.4 envoy -c /etc/envoy/envoy.yaml

down:
	@docker kill httpbin
	@docker kill envoy
