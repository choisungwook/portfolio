# 개요

* kserve로 서빙하는 예제

## 준비

* minio secret 생성

```sh
kubectl apply -f minio_secrets.yaml
```

## kserve 생성

```sh
kubectl apply -f ./sklearn
```

```sh
kubectl -n kubeflow-user-example-com get InferenceService
```

## model registry에서 모델 조회

```sh
# sickit learn
./get-latest-model.sh mnist sklearn
```

## 참고자료

* https://medium.com/@n.osagie/end-to-end-ml-pipeline-predicting-wine-quality-with-kubeflow-kserve-22e2bbacb387
* https://kyeongseo.tistory.com/entry/KServe%EB%A5%BC-%EC%9D%B4%EC%9A%A9%ED%95%9C-scikit-learn-%EB%AA%A8%EB%8D%B8-%EB%B0%B0%ED%8F%AC-%EB%B0%8F-%EC%82%AC%EC%9A%A9-%EA%B0%80%EC%9D%B4%EB%93%9C
* https://github.com/flopach/digits-recognizer-kubeflow/tree/master
* https://medium.com/@gabi.preda/building-machine-learning-pipelines-with-vertex-ai-and-kubeflow-in-gcp-2214442ba62d
