# E-REF API server (FastAPI + YOLOv8 + freshness models) for AWS EC2.
# Built on the instance by deploy/deploy.sh; Caddy in deploy/docker-compose.yml puts HTTPS in front.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    EREF_DATA_DIR=/data \
    EREF_DB_PATH=/data/eref.db

# OpenCV needs these shared libraries even in headless use.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only PyTorch first: the default wheel ships CUDA and is several GB, too big for a 20 GiB disk.
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

COPY backend/requirements.txt backend/requirements.txt
RUN grep -vE "^(ai-edge-litert|pytest|httpx)" backend/requirements.txt > /tmp/req.txt \
    && pip install -r /tmp/req.txt \
    && (pip install ai-edge-litert || echo "ai-edge-litert unavailable; the server falls back to the YOLOv8 freshness model")

# Code, web console and the trained weights the pipeline loads.
COPY backend backend
COPY WEBSITE WEBSITE
COPY runs runs
COPY yolov8n.pt yolov8n-cls.pt ./
COPY Datasets/dataset/dist/model_v2/final.tflite Datasets/dataset/dist/model_v2/final.tflite

VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"

CMD ["python", "-m", "uvicorn", "backend.server:app", "--host", "0.0.0.0", "--port", "8000"]
