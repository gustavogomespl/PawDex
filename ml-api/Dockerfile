FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
# Keep Ultralytics' config/weights inside the image so a non-root runtime user can
# read them and nothing is fetched at request time.
ENV TORCH_HOME=/app/.cache/torch
ENV YOLO_CONFIG_DIR=/app/.ultralytics
ARG PAWDEX_YOLO_MODEL=yolo11n.pt

RUN apt-get update \
  && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 curl \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir \
  --index-url https://download.pytorch.org/whl/cpu \
  torch==2.8.0 torchvision==0.23.0
RUN python -c "from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small; mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)"
RUN pip install --no-cache-dir -r requirements.txt
# Pre-bake the YOLO weights so the first request has no network dependency.
RUN python -c "from ultralytics import YOLO; YOLO('${PAWDEX_YOLO_MODEL}')"

COPY app ./app
COPY alembic.ini ./
COPY migrations ./migrations
COPY entrypoint.sh ./

RUN useradd --system --uid 1001 appuser \
  && chmod +x entrypoint.sh \
  && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
# Runs `alembic upgrade head` before launching uvicorn.
CMD ["sh", "entrypoint.sh"]
