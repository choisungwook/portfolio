# 개요
* pipeline에서 secret을 다루는 방법

# pipeline
* withCredentials 플러그인 사용

```
pipeline {
    agent any

    stages {
        stage('Hello') {
            steps {
                withCredentials([string(credentialsId: 'hello', variable: 'HELLO')]) {
                    sh 'echo ${HELLO}'
                    echo "${env.HELLO}"
                }
            }
        }
    }
}

```

# 참고자료
* [1] [stackoverflow](https://stackoverflow.com/questions/48182807/jenkins-use-withcredentials-in-global-environment-section)
* [2] [번역블로그-withCredentials 여러개 사용](https://www.javaer101.com/article/7059306.html)