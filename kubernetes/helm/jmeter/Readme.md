# 개요
* jmeter helm

# 사용 컨테이너 이미지
* master: choisunguk/jmeter:master
* server: choisunguk/jmeter:server

# helm 설정

| 필드 | 의미 | 디폴트 | 
| ---- | ---- | ------ |
| master.image.name | master jmeter 이미지 | choisunguk/jmeter:master |
| server.image.name | server jmeter 이미지 | choisunguk/jmeter:server |
| resource | master, server 컨테이너 리소스 제한 | request, limits 모두 1core, 1GB |