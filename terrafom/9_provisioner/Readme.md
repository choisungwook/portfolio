# Provisioners
* 인스턴스 리소스가 최초 생성될 때 실행되는 액션을 설정

## 예
* web이라는 인스턴스가 생설 될 때 echo 커맨드 실행
```yaml
resource "aws_instance" "web" {
  # ...

  provisioner "local-exec" {
    command = "echo The server's IP address is ${self.private_ip}"
  }
}
```

# 참고자료
https://blog.outsider.ne.kr/1342
/var/www/html 권한: https://stackoverflow.com/questions/50378664/permission-denied-inside-var-www-html-when-creating-a-website-and-its-files-wi/50379288
/var/www/html 권한: https://itreport.tistory.com/630
provisioner connection 공식문서: https://www.terraform.io/docs/language/resources/provisioners/connection.html
provisioner 공식문서: https://www.terraform.io/docs/language/resources/provisioners/syntax.html