# Couples Gallery - TrueNAS Deployment Guide

## Overview
This guide explains how to deploy the Couples Gallery app on your TrueNAS server using Docker (Dockge).

## Prerequisites
- TrueNAS Scale with Docker/Dockge installed
- Nginx Proxy Manager configured
- Domain `weddingsbymark.uk` pointed to your server

## Directory Structure

Create the following directories on your TrueNAS:

```bash
# Via TrueNAS Shell
mkdir -p /mnt/apps/couplesgallerydata/mongodb
mkdir -p /mnt/apps/couplesgallerydata/app
mkdir -p /mnt/nextcloud/couplesgalleryfiles

# Set permissions
chown -R 1000:1000 /mnt/apps/couplesgallerydata
chown -R 1000:1000 /mnt/nextcloud/couplesgalleryfiles
```

## Deployment Steps

### 1. Copy Files to TrueNAS

Upload the following files to your TrueNAS:
- `docker-compose.yml` 
- `backend/` folder (with Dockerfile and server.py)
- `frontend/` folder (with Dockerfile and React app)
- `nginx.conf`

Recommended location: `/mnt/apps/couple-galleries/`

### 2. Configure Environment

Edit `docker-compose.yml` and set your JWT secret:

```yaml
environment:
  - JWT_SECRET=your-very-long-random-secret-key-here
```

Generate a secure key:
```bash
openssl rand -hex 32
```

### 3. Deploy via Dockge

1. Open Dockge web interface
2. Click "Create Stack"
3. Name it `couple-galleries`
4. Paste the docker-compose.yml content
5. Click "Deploy"

### 4. Configure Nginx Proxy Manager

Add a new Proxy Host:

| Field | Value |
|-------|-------|
| Domain | weddingsbymark.uk |
| Scheme | http |
| Forward Hostname | couples-gallery-nginx |
| Forward Port | 80 |
| SSL | Request new Let's Encrypt certificate |
| Force SSL | Yes |
| HTTP/2 | Yes |

### 5. First-Time Setup

1. Visit `https://weddingsbymark.uk`
2. Create your admin account
3. Start creating galleries!

## File Storage

| Path | Purpose |
|------|----------|
| `/mnt/apps/couplesgallerydata/mongodb` | Database files |
| `/mnt/apps/couplesgallerydata/app` | Thumbnails, previews |
| `/mnt/nextcloud/couplesgalleryfiles` | Original photos/videos |

## Share Link Format

Share links follow your current Nextcloud format:
- `https://weddingsbymark.uk/ginamark301021`
- `https://weddingsbymark.uk/sarahjohn150624`

## Permissions

| Level | Can View | Can Download | Can Edit | Can Delete |
|-------|----------|--------------|----------|------------|
| Read Only | ✓ | ✓ | ✗ | ✗ |
| Edit | ✓ | ✓ | ✓ | ✗ |
| Full Access | ✓ | ✓ | ✓ | ✓ |

## Backup

Backup these locations regularly:
- `/mnt/apps/couplesgallerydata/mongodb`
- `/mnt/nextcloud/couplesgalleryfiles`

## Troubleshooting

### App won't start
```bash
cd /mnt/apps/couple-galleries
docker-compose logs -f
```

### Database issues
```bash
docker exec -it couples-gallery-db mongosh
```

### Reset admin account
Connect to MongoDB and delete the admin:
```javascript
use couples_gallery
db.admins.deleteMany({})
```
Then visit the app to create a new admin.

## Updating

```bash
cd /mnt/apps/couple-galleries
git pull  # if using git
docker-compose build --no-cache
docker-compose up -d
```

---

**Need help?** The app is fully self-contained and all data stays on your TrueNAS server.
