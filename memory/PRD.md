# Couples Gallery - Product Requirements Document

## Project Overview
A self-hosted couples gallery sharing application for wedding photographer Mark, replacing Nextcloud for client gallery management.

## Original Problem Statement
Build a self-hosted app where the admin can:
- Create hierarchical folder structures for couples (Wedding Images, Videos, Albums, Favourites)
- Upload files through web interface
- Create share links with custom tokens (format: `ginamark301021`)
- Set 3-tier permissions: Read-only, Edit (no delete), Full access
- Generate QR codes for any share link
- Secure admin access with username/password

## User Personas

### Primary: Mark (Admin/Photographer)
- Needs fast gallery creation and management
- Uploads 4600px images (needs thumbnail + preview generation)
- Creates custom share links matching existing Nextcloud format
- Requires dark mode admin interface

### Secondary: Couples (Gallery Viewers)
- Access galleries via share link (e.g., weddingsbymark.uk/ginamark301021)
- View thumbnails, larger previews, download originals
- Stream videos in browser
- Mobile-friendly browsing

## Core Requirements (Static)

### Authentication
- [x] First-run setup wizard for admin account creation
- [x] JWT-based authentication
- [x] 24-hour token expiration
- [x] Session persistence with auto-refresh

### Gallery Management
- [x] Create/rename/delete folders
- [x] Nested folder support (unlimited depth)
- [x] Folder path breadcrumb navigation
- [x] File upload with drag-drop
- [x] Multi-file upload support
- [x] File delete functionality

### Image Processing
- [x] Thumbnail generation (~300px)
- [x] Preview generation (~1500px, 30-35% of original)
- [x] Original file preservation (4600px)
- [x] Lazy loading for galleries

### Video Support
- [x] Video upload (mp4, mov, avi, mkv, webm)
- [x] In-browser video streaming
- [x] Video download option

### Share Links
- [x] Custom token support (e.g., `ginamark301021`)
- [x] 3-tier permissions (read/edit/full)
- [x] QR code generation
- [x] QR code download as PNG
- [x] Share link management (update permissions, delete)

### Public Gallery
- [x] Access via share token URL
- [x] Folder navigation within share scope
- [x] Image lightbox with navigation
- [x] Download buttons
- [x] Responsive design (mobile-friendly)

## What's Been Implemented

### Date: 2024-02-05
- Full backend API (FastAPI + MongoDB)
- React frontend with dark admin theme
- Light elegant gallery theme for couples
- "Weddings By Mark" branding (gold/champagne #ad946d)
- Setup wizard and login flows
- Dashboard with stats overview
- Folder management with CRUD operations
- File upload with thumbnail/preview generation
- Share link creation with QR codes
- Public gallery with lightbox
- Docker Compose for TrueNAS deployment
- Nginx proxy configuration
- Deployment documentation

## Tech Stack
- **Backend**: FastAPI, MongoDB, Python 3.11
- **Frontend**: React 19, Tailwind CSS, Framer Motion
- **Storage**: Local filesystem (TrueNAS volumes)
- **Auth**: JWT with bcrypt password hashing
- **Images**: Pillow for processing
- **QR**: qrcode library + qrcode.react

## Deployment Configuration
- **Domain**: weddingsbymark.uk
- **Data Path**: /mnt/apps/couplesgallerydata
- **Files Path**: /mnt/nextcloud/couplesgalleryfiles
- **SSL**: Via Nginx Proxy Manager

## Prioritized Backlog

### P0 (Critical) - DONE
- [x] Admin authentication
- [x] Folder CRUD
- [x] File upload
- [x] Share links
- [x] Public gallery

### P1 (Important) - Future
- [ ] Nextcloud folder import tool
- [ ] Bulk file operations (select multiple, delete)
- [ ] Favourites feature for couples (edit permission)
- [ ] Gallery analytics (view counts)

### P2 (Nice to Have)
- [ ] Email notifications when files added
- [ ] Expiring share links
- [ ] Password-protected shares
- [ ] Gallery comments
- [ ] Slideshow mode

## Next Tasks
1. Add your actual logo (replace camera icon)
2. Test Docker deployment on TrueNAS
3. Configure Nginx Proxy Manager
4. Migrate existing Nextcloud galleries
5. Set up backup schedule

## Files Reference
- `/app/backend/server.py` - Main API
- `/app/frontend/src/pages/` - React pages
- `/app/frontend/src/components/admin/` - Admin components
- `/app/docker/` - Docker deployment files
