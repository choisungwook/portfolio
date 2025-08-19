# 개요

* kubeflow pipeline

![](./imgs/pipeline.png)


## kubeflow IR yaml파일 만드는 방법

```sh
python kubeflow_pipeline.py
```

## model registry에 모델 정보를 가져오는 방법

* model reistry SDK를 사용하여 모델 정보를 가져와야 함
* kubernetes job으로 python script 실행

```sh
kubectl apply -f get_models_from_modelregistry.yaml
```



## 참고자료

* https://www.kubeflow.org/docs/components/model-registry/getting-started
* [akbun tensorflow ARM dockerfile](../../../dockerfiles/tensorflow/)
* https://medium.com/@gabi.preda/building-machine-learning-pipelines-with-vertex-ai-and-kubeflow-in-gcp-2214442ba62d
* https://medium.com/@lorenzo.colombi/kubeflow-pipeline-v2-tutorial-end-to-end-mnist-classifier-example-dc66714c2649
* https://blog.kubeflow.org/fraud-detection-e2e/
* https://docs.kakaocloud.com/en/tutorial/machine-learning-ai/traffic-prediction-model-serving
* kubeflow model registry API: https://www.kubeflow.org/docs/components/model-registry/reference/rest-api/
