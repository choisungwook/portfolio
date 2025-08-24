# Overview

* This project is to quickstart of kubeflow.

## Who am I?

* I'm familir with a kuberntes, but I don't know the AI and MLOps.
* I'd like to study about MLOps overview using kubeflow.

## What is a file?

* [kubeflow_pipeline.py](./kubeflow_pipeline.py) is a pipeline that importing dataset and build model with keras, train, evaulte, upload the model to kubeflow model registr
* I use MacOS M3 macbook. so I can't use kubeflow model registry ui. because it is not support to ARM container. I use a [python script](./model_registry_scripts/get_artifact_of_model.yaml) that getting a model information in kubeflow model registry.
* After training and uploading model to model registry, I want to serving with [kserve](./serving/InferenceService.yaml)
