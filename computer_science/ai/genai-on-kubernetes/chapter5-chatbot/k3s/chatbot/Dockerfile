FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt /app

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 7860

COPY gradio-app.py /app

CMD ["python", "gradio-app.py"]
