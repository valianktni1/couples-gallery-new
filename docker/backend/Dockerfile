FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libffi-dev \
    curl \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data/thumbnails /app/data/previews /app/files

EXPOSE 8001

# Increased timeout for large file uploads (25GB)
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--timeout-keep-alive", "3600"]
