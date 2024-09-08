FROM python:3.9-slim

WORKDIR /app

COPY . /app

RUN pip install --no-cache-dir -r requirements.txt
RUN apt update && apt install -y curl

EXPOSE 80

ENV pod_name=empty

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80"]
