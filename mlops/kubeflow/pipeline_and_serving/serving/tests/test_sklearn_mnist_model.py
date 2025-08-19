import requests
import json
from sklearn.datasets import fetch_openml

print("[Info] Download mnist datasets")
mnist = fetch_openml('mnist_784', version=1, parser='auto')
X_test = mnist.data.iloc[:5].values / 255.0  # 5개 샘플만 테스트
y_test = mnist.target.iloc[:5].astype(int).values  # 실제 정답 라벨

url = "http://localhost:8090/v1/models/mnist-model-sklearn:predict"
headers = {"Content-Type": "application/json"}
payload = {
  "instances": X_test.tolist()
}

# request
print("[Info] Sending prediction request")
response = requests.post(
  url,
  data=json.dumps(payload),
  headers=headers
)

print(f"[Info] Status: {response.status_code}")
print(f"[Info] Response: {response.text}")

if response.status_code == 200:
  predictions = response.json()["predictions"]
  print(f"[Info] Predictions is Succeeded: {predictions}")

  # 예측 결과와 실제 정답 비교
  print("\n[Info] Prediction Results:")
  print("-" * 50)
  correct_count = 0

  for i, (pred, actual) in enumerate(zip(predictions, y_test)):
    # sklearn 모델의 경우 클래스 인덱스를 직접 반환
    predicted_class = int(pred) if isinstance(pred, (int, float)) else int(pred[0])
    is_correct = predicted_class == actual
    correct_count += is_correct

    print(f"Sample {i+1}: Predicted={predicted_class}, Actual={actual}, "
          f"Match={'✅' if is_correct else '❌'}")

  # 정확도 계산
  accuracy = correct_count / len(y_test) * 100
  print("-" * 50)
  print(f"[Info] Accuracy: {correct_count}/{len(y_test)} ({accuracy:.1f}%)")

else:
  print(f"[Error] {response.text}")
