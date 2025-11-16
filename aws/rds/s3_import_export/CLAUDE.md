# 개요

* 이 프로젝트는 AWS RDS s3 import/export기능을 실습합니다.

## 제약사항

* 테라폼 제약사항 ~/.claude/skills/terraform/SKILL.md에 정의되어 있습니다.
* 마크다운 제약사항은 ~/.claude/skills/markdown/SKILL.md에 정의되어 있습니다.
* terraform
  * 테라폼코드는 ./terraform 디렉터리에 생성합니다.
  * 변수를 사용할 수 있는 부분은 variables.tf에 변수를 정의하고 terraform.tfvars.example에 예제값을 정의합니다.
  * 주석은 중요한것만 다세요.
  * outputs.tf에 output을 모으세요.
  * VPC
    * default VPC, subnet을 사용합니다.
    * default subnet은 data 리소스로 불러옵니다. data 리소스는 data.tf에 정의하세요
  * RDS
    * RDS는 default subnet에 위치합니다.
    * RDS는 aurora mysql 3.10을 사용합니다.
    * RDS는 performance insight를 활성화하세요. 기간은 무료기간인 7일을 설정하세요.
    * AZ는 AZ-a, AZ-c, AZ-b, AZ-d 순서로 사용합니다.
    * RDS 인스턴스는 한대만 사용합니다.
    * RDS는 public 에서 접근가능하게 합니다. 이 프로젝트는 운영에 사용하는게 아니고 저의 테스트예제이기 때문입니다. 단, RDS security group에서 저의 ip만 사용하도록 합니다. 저의 ip는 provisioner에서 curl ifconfig.me로 가져오고 security group inbound에 설정합니다.
    * password는 terraform random으로 설정한 값을 사용합니다. random 값은 12글자가 합니다. 비밀번호는 terraform outputs.tf에 출력되야 합니다.
    * RDS s3 import하기위한 iam과 parameter group설정이 필요합니다. iam.tf에 iam을 설정하고 parameter_group.tf에 parameter설정을 하세요. RDS는 이 설정을 사용해야 합니다.
      * RDS가 사용하는 IAM 권한은 아래처럼 설정하세요.
      * ref: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraMySQL.Integrating.Authorizing.IAM.S3CreatePolicy.html

    ```json
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "s3:ListBucket"
          ],
          "Resource": "arn:aws:s3:::your-bucket-name"
        },
        {
          "Effect": "Allow",
          "Action": [
            "s3:GetObject",
            "s3:GetObjectVersion",
            "s3:PutObject",
            "s3:DeleteObject",
            "s3:AbortMultipartUpload",
            "s3:ListMultipartUploadParts"
          ],
          "Resource": "arn:aws:s3:::your-bucket-name/*"
        }
      ]
    }
    ```

  * s3
    * s3는 akubun-{random}으로 설정합니다. random값은 terraform random을 사용합니다. s3 이름은 outputs.tf에 출력되야합니다.
  * mysql, postgres rds는 선택적으로 생성할 수 있도록 if(count)문을 사용해주세요. variables.tf에 bool 변수를 사용하세요.
