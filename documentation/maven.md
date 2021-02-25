# 개요
* maven 공부 정리

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