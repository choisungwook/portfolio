"""01-eda.ipynb의 EDA를 Kubeflow Pipelines 파이프라인으로 실행한다.

결과(그래프 8개와 요약 표)는 MLflow가 아니라 KFP 아티팩트로 남고, KFP 화면의 Visualization에서 본다.
"""
from kfp import dsl
from kfp.dsl import HTML, Dataset, Input, Markdown, Output

from common import BASE_IMAGE, load_data, submit, wait


@dsl.component(base_image=BASE_IMAGE)
def eda_report(data: Input[Dataset], summary: Output[Markdown], plots: Output[HTML]):
  """정답 비율과 컬럼별 범주 수를 Markdown 표로, 컬럼별 >50K 비율 막대그래프 8개를 HTML 한 장으로 남긴다."""
  import base64
  import io

  import matplotlib
  import pandas as pd
  matplotlib.use("Agg")
  import matplotlib.pyplot as plt

  df = pd.read_csv(data.path)
  df = df.apply(lambda col: col.str.strip())
  high = df.Target == ">50K"
  features = [c for c in df.columns if c != "Target"]
  lines = ["| 항목 | 값 |", "|---|---|", f"| 행 수 | {len(df)} |",
           f"| <=50K | {(~high).sum()} |", f"| >50K | {high.sum()} ({high.mean():.1%}) |"]
  lines += [f"| {c} 범주 수 | {df[c].nunique()} |" for c in features]
  with open(summary.path, "w") as f:
    f.write("\n".join(lines))

  images = []
  for column in features:
    rate = high.groupby(df[column]).mean().sort_values()
    fig, ax = plt.subplots(figsize=(8, max(3, len(rate) * 0.25)))
    rate.plot.barh(ax=ax, title=f"{column}: >50K rate")
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", bbox_inches="tight")
    plt.close(fig)
    images.append(f'<img src="data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode()}"/>')
  with open(plots.path, "w") as f:
    f.write("<html><body>" + "".join(images) + "</body></html>")


@dsl.pipeline(name="income-eda", description="UCI Adult 데이터를 읽고 EDA 결과를 KFP 아티팩트로 남긴다")
def income_eda_pipeline():
  """load-data 결과를 eda-report가 입력으로 받는다. KFP는 이 연결로 실행 순서와 아티팩트 리니지를 기록한다."""
  data_task = load_data()
  eda_report(data=data_task.outputs["data"])


if __name__ == "__main__":
  wait([submit(income_eda_pipeline, "eda")])
