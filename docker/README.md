# Weddings By Mark - Couples Gallery

A self-hosted photo and video gallery for sharing with your clients.

## Quick Deployment (TrueNAS with Dockge)

### Step 1: Create Required Folders

SSH into your TrueNAS server and run:

```bash
mkdir -p /mnt/apps/gallerydata/mongodb
mkdir -p /mnt/apps/gallerydata/thumbnails
mkdir -p /mnt/apps/gallerydata/previews
mkdir -p /mnt/nextcloud/galleryuserfiles
```

### Step 2: Clone from GitHub

After saving this project to GitHub using "Save to GitHub" button:

```bash
cd /mnt/apps/dockge/stacks
git clone https://github.com/YOUR_USERNAME/YOUR_REPO couples-gallery
cd couples-gallery/docker
```

### Step 3: Create Environment File

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
```

### Step 4: Deploy with Docker Compose

```bash
docker compose up -d
```

### Step 5: Configure Nginx Proxy Manager (IMPORTANT for large uploads)

In your Nginx Proxy Manager, edit the proxy host for `weddingsbymark.uk`:

1. Go to **Hosts → Proxy Hosts**
2. Edit your weddingsbymark.uk entry
3. Go to **Advanced** tab
4. Add these lines to the **Custom Nginx Configuration** box:

```nginx
client_max_body_size 25G;
proxy_connect_timeout 3600;
proxy_send_timeout 3600;
proxy_read_timeout 3600;
send_timeout 3600;
proxy_request_buffering off;
```

5. Click **Save**

Without this, large file uploads (videos) will fail!

### Step 6: Access Your Gallery

- Open your browser and go to: `https://weddingsbymark.uk`
- Create your admin account on first visit

---

## Features

- **Admin Dashboard**: Manage folders, upload files, create share links
- **Large File Support**: Upload files up to 25GB (wedding videos)
- **Bulk Uploads**: Upload hundreds of images at once with progress tracking
- **ZIP Downloads**: Download all files or selected files as a single ZIP
- **File Selection**: Select multiple files for bulk download or delete
- **Share Links**: Generate custom URLs for clients (e.g., `/ginamark301021`)
- **QR Codes**: Generate QR codes for easy sharing
- **Permissions**: Read-only, Edit, or Full access levels
- **Thumbnails**: Auto-generated for fast browsing
- **Video Streaming**: In-browser video playback

## File Structure

```
/mnt/apps/gallerydata/     # App data
├── mongodb/               # Database storage
├── thumbnails/            # Image thumbnails
└── previews/              # Image previews

/mnt/nextcloud/galleryuserfiles/  # Your media files
```

## Troubleshooting

### Large Files Fail to Upload

1. **Check Nginx Proxy Manager** - see Step 5 above
2. **Check browser console** for errors (F12 → Console tab)
3. **Check docker logs**: `docker logs gallery-api`

### Reset Admin Account

```bash
docker exec gallery-db mongosh couples_gallery --eval "db.admins.deleteMany({})"
```

Then visit the app to create a new admin account.

### View Logs

```bash
docker logs gallery-api    # Backend logs
docker logs gallery-web    # Frontend logs
docker logs gallery-nginx  # Nginx logs
```

### Restart Services

```bash
docker compose restart
```

### Rebuild After Code Changes

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```
