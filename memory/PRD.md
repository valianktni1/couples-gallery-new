# Weddings By Mark - Couples Gallery PRD

## Original Problem Statement
Build a self-hosted application for sharing photos and videos with wedding clients (couples). The app should be simpler than Nextcloud with these key requirements:

- **Admin**: Secure login with username/password
- **File Structure**: Create nested folders (e.g., `Wedding Images/Videos/Album/Favourites`)
- **Upload**: Web interface to upload images and videos, support for large files (up to 25GB) and bulk uploads (600+ images)
- **Sharing**: Generate unique, customizable share links per folder (e.g., `weddingsbymark.uk/ginamark301021`)
- **Permissions**: Read-only (view/download), Edit (no delete), and Full access levels
- **QR Codes**: Generate QR code for any share link

## User Environment
- **Hosting**: Self-hosted on TrueNAS server using Dockge
- **Domain**: `weddingsbymark.uk` with SSL via Nginx Proxy Manager
- **External Port**: 3029
- **Data Paths**:
  - App Data: `/mnt/apps/gallerydata`
  - Media Files: `/mnt/nextcloud/galleryuserfiles`

## Tech Stack
- **Frontend**: React.js with Tailwind CSS and Shadcn/UI
- **Backend**: Python FastAPI
- **Database**: MongoDB
- **Deployment**: Docker Compose
- **Reverse Proxy**: Nginx (for internal routing)

---

## What's Been Implemented

### Core Features (100% Complete)
- [x] Admin authentication with JWT tokens
- [x] Setup wizard for first-time admin creation
- [x] Folder management (create, rename, delete, nested folders)
- [x] File uploads with chunked streaming (supports large files)
- [x] Automatic thumbnail and preview generation for images
- [x] Video file support with streaming playback
- [x] Share link creation with custom tokens
- [x] Three permission levels (read, edit, full)
- [x] QR code generation for share links
- [x] Public gallery page for clients

### UI Features (100% Complete)
- [x] Dark admin theme with "Weddings By Mark" branding
- [x] Bulk upload with real-time progress bar (XHR-based with per-file tracking)
- [x] File selection mode (Select, Select All, Deselect All)
- [x] **Download All as ZIP** - single ZIP file download
- [x] **Download Selected as ZIP** - selected files as ZIP
- [x] Delete Selected files with confirmation
- [x] Image preview modal with download option
- [x] Responsive file grid layout
- [x] Breadcrumb navigation for nested folders

### Activity Logging (100% Complete - Feb 2026)
- [x] Activity Logs dashboard page for admin
- [x] Logs gallery views with share token, folder name, IP address, timestamp
- [x] Logs file downloads with folder name, file name, IP address
- [x] Stats cards showing counts for: Gallery Views, File Downloads, ZIP Downloads, File Uploads
- [x] Paginated log table with refresh and clear all functionality

### Admin Features (100% Complete - Feb 2026)
- [x] **Any File Type Upload** - Admin can upload any file type for backup purposes (not just images/videos)
- [x] Folder duplication for templates
- [x] Share links for subfolders

### Deployment (Ready)
- [x] Docker Compose configuration
- [x] Backend Dockerfile with timeout settings for large uploads
- [x] Frontend Dockerfile
- [x] Nginx configuration with 25GB upload limit
- [x] README with simple deployment instructions

---

## Database Schema

### admins
```json
{
  "id": "uuid",
  "username": "string",
  "password_hash": "string",
  "created_at": "datetime"
}
```

### folders
```json
{
  "id": "uuid",
  "name": "string",
  "parent_id": "uuid|null",
  "created_at": "datetime"
}
```

### files
```json
{
  "id": "uuid",
  "name": "string",
  "folder_id": "uuid",
  "stored_name": "string",
  "file_type": "image|video|other",
  "size": "number",
  "created_at": "datetime"
}
```

### shares
```json
{
  "id": "uuid",
  "folder_id": "uuid",
  "token": "string",
  "permission": "read|edit|full",
  "created_at": "datetime"
}
```

### activity_logs (New - Feb 2026)
```json
{
  "id": "uuid",
  "action": "gallery_view|file_download|zip_download|file_upload",
  "share_token": "string|null",
  "folder_name": "string|null",
  "file_name": "string|null",
  "details": "object",
  "ip_address": "string",
  "created_at": "datetime"
}
```

---

## API Endpoints

### Setup & Auth
- `GET /api/setup/status` - Check if admin exists
- `POST /api/setup/admin` - Create initial admin
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info

### Folders
- `GET /api/folders` - List folders (with parent_id filter)
- `POST /api/folders` - Create folder
- `GET /api/folders/{id}` - Get folder details
- `PUT /api/folders/{id}` - Update folder
- `DELETE /api/folders/{id}` - Delete folder and contents
- `GET /api/folders/{id}/path` - Get breadcrumb path

### Files
- `POST /api/files/upload` - Upload file (supports up to 25GB)
- `GET /api/files` - List files in folder
- `GET /api/files/{id}/thumbnail` - Get thumbnail
- `GET /api/files/{id}/preview` - Get preview
- `GET /api/files/{id}/download` - Download file
- `GET /api/files/{id}/stream` - Stream video
- `DELETE /api/files/{id}` - Delete file
- `POST /api/files/download-zip` - Download selected files as ZIP
- `GET /api/folders/{id}/download-zip` - Download folder contents as ZIP

### Shares
- `GET /api/shares` - List all shares
- `POST /api/shares` - Create share
- `PUT /api/shares/{id}` - Update permission
- `DELETE /api/shares/{id}` - Delete share
- `GET /api/shares/{id}/qrcode` - Get QR code image

### Public Gallery
- `GET /api/gallery/{token}` - Get gallery info
- `GET /api/gallery/{token}/folders` - Get gallery folders
- `GET /api/gallery/{token}/files` - Get gallery files
- `GET /api/gallery/{token}/path` - Get gallery breadcrumb

### Stats
- `GET /api/stats` - Get dashboard statistics

---

## Deployment Ready Checklist

### Completed
- [x] All source code consolidated in `/app/docker/`
- [x] Docker Compose with correct volume paths
- [x] Backend with large file upload support
- [x] Frontend with all UI features
- [x] Nginx with 25GB limit and proper timeouts
- [x] README with simple deployment instructions

### For User to Do
1. Use "Save to GitHub" button in Emergent
2. SSH into TrueNAS server
3. Clone repository to `/mnt/apps/dockge/stacks/couples-gallery`
4. Create data directories
5. Run `docker compose up -d`

---

## Future/Backlog Tasks

### P1 - High Priority
- [ ] Verify large file uploads work (25GB videos)
- [ ] Test bulk uploads (600+ images)

### P2 - Medium Priority
- [ ] Nextcloud migration tool (import existing folder structure)
- [ ] Expiring share links
- [ ] Password protection for share links

### P3 - Nice to Have
- [ ] Batch thumbnail regeneration
- [ ] Gallery customization (themes/colors per client)
- [ ] Download statistics
- [ ] Email notification when gallery is viewed

---

## Test Credentials
- Username: `admin`
- Password: `admin123`

(These are for development testing only - user will create their own on first setup)
