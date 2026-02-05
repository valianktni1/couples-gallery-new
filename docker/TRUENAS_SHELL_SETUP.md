# TrueNAS Shell Setup Guide - Couples Gallery

## Complete step-by-step commands for TrueNAS Shell

### STEP 1: Create Directory Structure
```bash
# Create all required directories
mkdir -p /mnt/apps/couple-galleries
mkdir -p /mnt/apps/couplesgallerydata/mongodb
mkdir -p /mnt/apps/couplesgallerydata/thumbnails
mkdir -p /mnt/apps/couplesgallerydata/previews
mkdir -p /mnt/nextcloud/couplesgalleryfiles

# Set permissions
chown -R 1000:1000 /mnt/apps/couplesgallerydata
chown -R 1000:1000 /mnt/nextcloud/couplesgalleryfiles
chmod -R 755 /mnt/apps/couplesgallerydata
chmod -R 755 /mnt/nextcloud/couplesgalleryfiles
```

### STEP 2: Navigate to App Directory
```bash
cd /mnt/apps/couple-galleries
```

### STEP 3: Create Backend Dockerfile
```bash
mkdir -p backend
cat > backend/Dockerfile << 'DOCKERFILE'
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libffi-dev \
    curl \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories
RUN mkdir -p /app/data/thumbnails /app/data/previews /app/files

EXPOSE 8001

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
DOCKERFILE
```

### STEP 4: Create Backend Requirements
```bash
cat > backend/requirements.txt << 'REQUIREMENTS'
fastapi==0.115.0
uvicorn[standard]==0.30.6
python-dotenv==1.0.1
python-multipart==0.0.9
motor==3.5.1
pydantic==2.9.2
PyJWT==2.9.0
bcrypt==4.2.0
aiofiles==24.1.0
Pillow==10.4.0
qrcode[pil]==8.0
REQUIREMENTS
```

### STEP 5: Create Backend Server (server.py)
This is a large file - copy it from the deployment package or use the Emergent export.

### STEP 6: Create Frontend Dockerfile
```bash
mkdir -p frontend
cat > frontend/Dockerfile << 'DOCKERFILE'
# Build stage
FROM node:20-alpine as build

WORKDIR /app

ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

# Production stage
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html

RUN echo 'server { \
    listen 3000; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
DOCKERFILE
```

### STEP 7: Create Nginx Config
```bash
mkdir -p nginx
cat > nginx/nginx.conf << 'NGINXCONF'
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml;

    client_max_body_size 25G;

    proxy_connect_timeout 3600;
    proxy_send_timeout 3600;
    proxy_read_timeout 3600;
    send_timeout 3600;
    
    proxy_request_buffering off;
    proxy_buffering off;
    keepalive_timeout 3600;

    upstream backend {
        server backend:8001;
    }

    upstream frontend {
        server frontend:3000;
    }

    server {
        listen 80;
        server_name _;

        location /api/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
NGINXCONF
```

### STEP 8: Create .env File
```bash
# Generate secure JWT secret
JWT_SECRET=$(openssl rand -hex 64)
echo "JWT_SECRET=$JWT_SECRET" > .env
echo "Generated JWT_SECRET - keep this safe!"
cat .env
```

### STEP 9: Verify Structure
```bash
find /mnt/apps/couple-galleries -type f
```

Expected output:
```
/mnt/apps/couple-galleries/docker-compose.yml
/mnt/apps/couple-galleries/backend/Dockerfile
/mnt/apps/couple-galleries/backend/requirements.txt
/mnt/apps/couple-galleries/backend/server.py
/mnt/apps/couple-galleries/frontend/Dockerfile
/mnt/apps/couple-galleries/frontend/... (React files)
/mnt/apps/couple-galleries/nginx/nginx.conf
/mnt/apps/couple-galleries/.env
```

---

## Nginx Proxy Manager Setup

| Field | Value |
|-------|-------|
| Domain | weddingsbymark.uk |
| Scheme | http |
| Forward Hostname/IP | YOUR_TRUENAS_IP |
| Forward Port | 3029 |
| SSL | Request Let's Encrypt |
| Force SSL | Yes |
| HTTP/2 | Yes |

---

## Backup Commands

```bash
# Backup database
mongodump --uri="mongodb://localhost:27017" --db=couples_gallery --out=/mnt/backups/gallery-$(date +%Y%m%d)

# Backup all data
tar -czvf /mnt/backups/gallery-full-$(date +%Y%m%d).tar.gz \
    /mnt/apps/couplesgallerydata \
    /mnt/nextcloud/couplesgalleryfiles
```

---

## Troubleshooting

```bash
# Check container logs
docker logs couples-gallery-api
docker logs couples-gallery-web
docker logs couples-gallery-db
docker logs couples-gallery-nginx

# Restart all services
cd /mnt/apps/couple-galleries
docker-compose restart

# Full rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```
