# 개요
* maven 공부 정리

# maven 명령어
* validate - validate the project is correct and all necessary information is available
* compile - compile the source code of the project
* test - test the compiled source code using a suitable unit testing framework. These tests should not require the code be packaged or deployed
* package - take the compiled code and package it in its distributable format, such as a JAR.
* verify - run any checks on results of integration tests to ensure quality criteria are met
* install - install the package into the local repository, for use as a dependency in other projects locally
* deploy - done in the build environment, copies the final package to the remote repository for sharing with other developers and projects.

# 빌드
```
mvn clean package
```

# maven과 nexus연동
```
<distributionManagement>
    <repository>
        <id>releases</id> //FORMAT
        <url>https://nexus.example.com/content/repositories/releases</url> //FORMAT
    </repository>
    <snapshotRepository>
        <id>snapshots</id> //FORMAT
        <url>https://nexus.example.com/content/repositories/snapshots</url> //FORMAT
    </snapshotRepository>
</distributionManagement>
```

# 인코딩 오류
```
<properties>
    <global.encoding>UTF-8</global.encoding>
    <java-version>1.6</java-version>
    <jackson.version>2.9.7</jackson.version>
    <org.springframework-version>5.1.7.RELEASE</org.springframework-version>
    <org.aspectj-version>1.6.10</org.aspectj-version>
    <org.slf4j-version>1.6.6</org.slf4j-version>
</properties>
```

![](imgs/encoding_cp1252.png)


# 참고자료
* [1] [블로그-maven과 nexus연동](https://www.lesstif.com/sonatype-nexus/%EB%A9%94%EC%9D%B4%EB%B8%90%EA%B3%BC-%EC%97%B0%EA%B3%84-31850837.html)
* [2] [블로그-maven 명령어](https://yongary.tistory.com/255)