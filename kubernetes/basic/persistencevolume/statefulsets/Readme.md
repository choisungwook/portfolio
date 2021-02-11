# 개요
* 실험주제: volmeclaimtemplates에서 생성한 pvc를 삭제하면 mount된 volume도 삭제될까?

# 준비
* 동적 프로비저닝 활성화
* storageclass 설정
```yaml
; templates/statefulsets.yaml
storageClass: 'your sotrageclass name'
```

# 결과
* pvc를 삭제하면 동적 프로비저닝 된 디렉터리도 삭제된다. 


# 참고자료
* [1] 공식문서: https://kubernetes.io/ko/docs/concepts/workloads/controllers/statefulset/