# ADD vs COPY 차이점
* 일반적으로 COPY를 많이 사용한다. 그 이유는 ADD는 파일을 복사하고 추가 작업(압축해제)이 있기 때문에 작업 히스토리 추적이 어렵다.
* ADD는 압축파일 해제 뿐만 아니라 파일을 다운로드 받는 기능이 있다.

# 실습
* [클릭하면 링크로 이동됩니다](./addcopy/Readme.md)

# 참고자료
* docker 공식문서 best-practices : https://docs.docker.com/develop/develop-images/dockerfile_best-practices/
