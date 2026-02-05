#!/bin/bash
#############################################
# COUPLES GALLERY - TRUENAS DEPLOYMENT SCRIPT
# Weddings By Mark
# 
# Run this script from TrueNAS Shell:
# bash setup.sh
#############################################

set -e  # Exit on any error

echo "=========================================="
echo "  COUPLES GALLERY - TrueNAS Setup"
echo "  Weddings By Mark"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

#############################################
# STEP 1: Create Directory Structure
#############################################
echo -e "${YELLOW}[1/6] Creating directories...${NC}"

mkdir -p /mnt/apps/couple-galleries
mkdir -p /mnt/apps/couplesgallerydata/mongodb
mkdir -p /mnt/apps/couplesgallerydata/thumbnails
mkdir -p /mnt/apps/couplesgallerydata/previews
mkdir -p /mnt/nextcloud/couplesgalleryfiles

chown -R 1000:1000 /mnt/apps/couplesgallerydata
chown -R 1000:1000 /mnt/nextcloud/couplesgalleryfiles
chmod -R 755 /mnt/apps/couplesgallerydata
chmod -R 755 /mnt/nextcloud/couplesgalleryfiles

echo -e "${GREEN}✓ Directories created${NC}"

#############################################
# STEP 2: Navigate to app directory
#############################################
cd /mnt/apps/couple-galleries

#############################################
# STEP 3: Generate JWT Secret
#############################################
echo -e "${YELLOW}[2/6] Generating secure JWT secret...${NC}"

JWT_SECRET=$(openssl rand -hex 64)
echo "JWT_SECRET=$JWT_SECRET" > .env
echo -e "${GREEN}✓ JWT secret generated${NC}"

#############################################
# STEP 4: Create nginx directory and config
#############################################
echo -e "${YELLOW}[3/6] Creating nginx configuration...${NC}"

mkdir -p nginx
cat > nginx/nginx.conf << 'NGINXEOF'
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

    # 25GB upload limit for large wedding videos
    client_max_body_size 25G;

    # 1 hour timeouts for large uploads
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
NGINXEOF

echo -e "${GREEN}✓ Nginx config created${NC}"

#############################################
# STEP 5: Create backend
#############################################
echo -e "${YELLOW}[4/6] Creating backend...${NC}"

mkdir -p backend

# Backend Dockerfile
cat > backend/Dockerfile << 'DOCKEREOF'
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

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
DOCKEREOF

# Backend requirements
cat > backend/requirements.txt << 'REQEOF'
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
REQEOF

echo -e "${GREEN}✓ Backend Dockerfile and requirements created${NC}"
echo -e "${YELLOW}   NOTE: You need to copy server.py from the deployment package${NC}"

#############################################
# STEP 6: Create frontend
#############################################
echo -e "${YELLOW}[5/6] Creating frontend...${NC}"

mkdir -p frontend

# Frontend Dockerfile
cat > frontend/Dockerfile << 'DOCKEREOF'
FROM node:20-alpine as build

WORKDIR /app

ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

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
DOCKEREOF

echo -e "${GREEN}✓ Frontend Dockerfile created${NC}"
echo -e "${YELLOW}   NOTE: You need to copy the frontend src files from the deployment package${NC}"

#############################################
# STEP 7: Create docker-compose.yml
#############################################
echo -e "${YELLOW}[6/6] Creating docker-compose.yml...${NC}"

cat > docker-compose.yml << 'COMPOSEEOF'
version: '3.8'

# Couples Gallery - Weddings By Mark
# Port: 3029 | Max Upload: 25GB

services:
  mongodb:
    image: mongo:7.0
    container_name: couples-gallery-db
    restart: unless-stopped
    volumes:
      - /mnt/apps/couplesgallerydata/mongodb:/data/db
    environment:
      - MONGO_INITDB_DATABASE=couples_gallery
    networks:
      - gallery-network
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: couples-gallery-api
    restart: unless-stopped
    depends_on:
      mongodb:
        condition: service_healthy
    volumes:
      - /mnt/apps/couplesgallerydata/thumbnails:/app/data/thumbnails
      - /mnt/apps/couplesgallerydata/previews:/app/data/previews
      - /mnt/nextcloud/couplesgalleryfiles:/app/files
    environment:
      - MONGO_URL=mongodb://mongodb:27017
      - DB_NAME=couples_gallery
      - CORS_ORIGINS=*
      - JWT_SECRET=${JWT_SECRET}
      - SHARE_DOMAIN=https://weddingsbymark.uk
      - DATA_DIR=/app/data
      - FILES_DIR=/app/files
    networks:
      - gallery-network
    healthcheck:
      test: curl -f http://localhost:8001/api/ || exit 1
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 15s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - REACT_APP_BACKEND_URL=https://weddingsbymark.uk
    container_name: couples-gallery-web
    restart: unless-stopped
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - gallery-network
    healthcheck:
      test: curl -f http://localhost:3000 || exit 1
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s

  nginx:
    image: nginx:alpine
    container_name: couples-gallery-nginx
    restart: unless-stopped
    depends_on:
      backend:
        condition: service_healthy
      frontend:
        condition: service_healthy
    ports:
      - "3029:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    networks:
      - gallery-network

networks:
  gallery-network:
    driver: bridge
COMPOSEEOF

echo -e "${GREEN}✓ docker-compose.yml created${NC}"

#############################################
# DONE
#############################################
echo ""
echo "=========================================="
echo -e "${GREEN}  SETUP COMPLETE!${NC}"
echo "=========================================="
echo ""
echo "Directory structure created at: /mnt/apps/couple-galleries"
echo ""
echo -e "${YELLOW}NEXT STEPS:${NC}"
echo "1. Copy server.py to /mnt/apps/couple-galleries/backend/"
echo "2. Copy frontend files to /mnt/apps/couple-galleries/frontend/"
echo "3. In Dockge: Create stack 'couple-galleries' from this folder"
echo "4. Configure Nginx Proxy Manager:"
echo "   - Domain: weddingsbymark.uk"
echo "   - Forward to: YOUR_TRUENAS_IP:3029"
echo "   - Enable SSL"
echo ""
echo "Your JWT secret has been saved to .env"
echo ""
ls -la /mnt/apps/couple-galleries/
