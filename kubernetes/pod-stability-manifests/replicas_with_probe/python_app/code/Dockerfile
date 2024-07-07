FROM python:3.12.1

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt
RUN apt-get update && apt-get install -y stress

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--reload"]
