- [개요](#개요)
- [백업](#백업)
- [복원](#복원)
  - [준비](#준비)
  - [백업](#백업-1)
  - [서비스 재실행](#서비스-재실행)
- [정기백업 설정](#정기백업-설정)
- [백업 설정](#백업-설정)
  - [백업파일 라이플사이클](#백업파일-라이플사이클)
- [참고자료](#참고자료)

# 개요
* gitlab 백업

<br>

# 백업
* 백업 명령어
  * tar파일로 백업
```
sudo gitlab-rake gitlab:backup:create
```

* 백업된 파일이 저장되는 경로
  * /var/opt/gitlab/backups

* 백업경로 변경
```
vi /etc/gitlab/gitlab.rb
gitlab_rails['backup_path'] = "/var/opt/gitlab/backups"
```

# 복원
## 준비
* gitlab-ctl 실행
```
sudo gitlab-ctl start
```
* gitlab DB 서비스 중지
```
sudo gitlab-ctl stop unicorn
sudo gitlab-ctl stop puma
sudo gitlab-ctl stop sidekiq

# Verify
sudo gitlab-ctl status
```

## 백업
```
sudo gitlab-rake gitlab:backup:restore BACKUP=[백업파일 이름]
```

## 서비스 재실행
```
sudo gitlab-ctl reconfigure
sudo gitlab-ctl restart
sudo gitlab-rake gitlab:check SANITIZE=true
```

# 정기백업 설정
* 매일 2시에 백업하는 cronjob 생성
```
sudo crontab -e
0 2 * * * /opt/gitlab/bin/gitlab-rake gitlab:backup:create
```

<br>

# 백업 설정
## 백업파일 라이플사이클
```
sudo vi /etc/gitlab/gitlab.rb

gitlab_rails['backup_keep_time'] = 604800
```

<br>

# 참고자료
* [1] [블로그](https://judo0179.tistory.com/50)
* [2] [gitlab 공식문서-백업](https://docs.gitlab.com/ee/raketasks/backup_restore.html)
* [3] [블로그](https://blog.naver.com/punxoi/220296044529)
* [4] [git issue-백업파일 라이플사이클 설정](https://github.com/TheOpenCloudEngine/uEngine-cloud/issues/34)