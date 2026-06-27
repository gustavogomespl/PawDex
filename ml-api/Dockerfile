FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 curl \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir \
  --index-url https://download.pytorch.org/whl/cpu \
  torch==2.8.0 torchvision==0.23.0
RUN python -c "from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small; mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)"
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
