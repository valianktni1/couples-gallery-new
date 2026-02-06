from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Query, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse as FastAPIFileResponse, StreamingResponse
from starlette.background import BackgroundTask
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import aiofiles
import qrcode
from io import BytesIO
from PIL import Image
import json
import shutil

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# File storage paths - these will be mapped in Docker
DATA_DIR = Path(os.environ.get('DATA_DIR', '/app/data'))
FILES_DIR = Path(os.environ.get('FILES_DIR', '/app/files'))
THUMBNAILS_DIR = DATA_DIR / 'thumbnails'
PREVIEWS_DIR = DATA_DIR / 'previews'

# Create directories
for d in [DATA_DIR, FILES_DIR, THUMBNAILS_DIR, PREVIEWS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# JWT settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-this-in-production-please')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Domain for share links
SHARE_DOMAIN = os.environ.get('SHARE_DOMAIN', 'https://weddingsbymark.uk')

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class AdminCreate(BaseModel):
    username: str
    password: str

class AdminLogin(BaseModel):
    username: str
    password: str

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None

class FolderUpdate(BaseModel):
    name: str

class ShareCreate(BaseModel):
    folder_id: str
    token: str
    permission: str = "read"  # read, edit, full

class ShareUpdate(BaseModel):
    permission: str

class FolderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    parent_id: Optional[str]
    created_at: str
    file_count: int = 0
    subfolder_count: int = 0

class FileResponseModel(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    folder_id: str
    file_type: str
    size: int
    created_at: str
    thumbnail_url: Optional[str] = None
    preview_url: Optional[str] = None

class ShareResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    folder_id: str
    token: str
    permission: str
    created_at: str
    share_url: str
    folder_name: str = ""

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(username: str) -> str:
    payload = {
        'sub': username,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get('sub')
        admin = await db.admins.find_one({'username': username}, {'_id': 0})
        if not admin:
            raise HTTPException(status_code=401, detail="Invalid token")
        return admin
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ==================== ACTIVITY LOGGING ====================

async def log_activity(action: str, share_token: str = None, folder_name: str = None, file_name: str = None, details: dict = None, ip_address: str = None):
    """Log client activity for tracking"""
    log_entry = {
        'id': str(uuid.uuid4()),
        'action': action,
        'share_token': share_token,
        'folder_name': folder_name,
        'file_name': file_name,
        'details': details or {},
        'ip_address': ip_address,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.activity_logs.insert_one(log_entry)

# ==================== IMAGE PROCESSING ====================

async def generate_thumbnail(file_path: Path, file_id: str) -> Optional[str]:
    try:
        with Image.open(file_path) as img:
            img.thumbnail((300, 300), Image.Resampling.LANCZOS)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            thumb_path = THUMBNAILS_DIR / f"{file_id}.jpg"
            img.save(thumb_path, 'JPEG', quality=85)
            return str(thumb_path)
    except Exception as e:
        logger.error(f"Thumbnail generation failed: {e}")
        return None

async def generate_preview(file_path: Path, file_id: str, max_size: int = 1500) -> Optional[str]:
    try:
        with Image.open(file_path) as img:
            ratio = min(max_size / img.width, max_size / img.height)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            preview_path = PREVIEWS_DIR / f"{file_id}.jpg"
            img.save(preview_path, 'JPEG', quality=90)
            return str(preview_path)
    except Exception as e:
        logger.error(f"Preview generation failed: {e}")
        return None

# ==================== SETUP ROUTES ====================

@api_router.get("/setup/status")
async def check_setup_status():
    admin_count = await db.admins.count_documents({})
    return {"setup_complete": admin_count > 0}

@api_router.post("/setup/admin")
async def setup_admin(admin: AdminCreate):
    existing = await db.admins.count_documents({})
    if existing > 0:
        raise HTTPException(status_code=400, detail="Admin already exists")
    
    admin_doc = {
        'id': str(uuid.uuid4()),
        'username': admin.username,
        'password_hash': hash_password(admin.password),
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.admins.insert_one(admin_doc)
    token = create_token(admin.username)
    return {"message": "Admin created", "token": token}

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/login")
async def login(credentials: AdminLogin):
    admin = await db.admins.find_one({'username': credentials.username})
    if not admin or not verify_password(credentials.password, admin['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(credentials.username)
    return {"token": token, "username": credentials.username}

@api_router.get("/auth/me")
async def get_me(admin = Depends(get_current_admin)):
    return {"username": admin['username']}

# ==================== FOLDER ROUTES ====================

@api_router.post("/folders", response_model=FolderResponse)
async def create_folder(folder: FolderCreate, admin = Depends(get_current_admin)):
    folder_doc = {
        'id': str(uuid.uuid4()),
        'name': folder.name,
        'parent_id': folder.parent_id,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.folders.insert_one(folder_doc)
    return FolderResponse(**folder_doc)

@api_router.get("/folders", response_model=List[FolderResponse])
async def get_folders(parent_id: Optional[str] = None, admin = Depends(get_current_admin)):
    # Handle empty string as null for root folders
    if parent_id == '' or parent_id == 'null':
        parent_id = None
    query = {'parent_id': parent_id}
    folders = await db.folders.find(query, {'_id': 0}).to_list(1000)
    
    result = []
    for f in folders:
        file_count = await db.files.count_documents({'folder_id': f['id']})
        subfolder_count = await db.folders.count_documents({'parent_id': f['id']})
        result.append(FolderResponse(**f, file_count=file_count, subfolder_count=subfolder_count))
    return result

@api_router.get("/folders/{folder_id}", response_model=FolderResponse)
async def get_folder(folder_id: str, admin = Depends(get_current_admin)):
    folder = await db.folders.find_one({'id': folder_id}, {'_id': 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    file_count = await db.files.count_documents({'folder_id': folder_id})
    subfolder_count = await db.folders.count_documents({'parent_id': folder_id})
    return FolderResponse(**folder, file_count=file_count, subfolder_count=subfolder_count)

@api_router.put("/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(folder_id: str, folder: FolderUpdate, admin = Depends(get_current_admin)):
    result = await db.folders.update_one({'id': folder_id}, {'$set': {'name': folder.name}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Folder not found")
    updated = await db.folders.find_one({'id': folder_id}, {'_id': 0})
    return FolderResponse(**updated)

@api_router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, admin = Depends(get_current_admin)):
    # Delete all files in folder
    files = await db.files.find({'folder_id': folder_id}, {'_id': 0}).to_list(1000)
    for f in files:
        file_path = FILES_DIR / f['stored_name']
        if file_path.exists():
            file_path.unlink()
        thumb_path = THUMBNAILS_DIR / f"{f['id']}.jpg"
        if thumb_path.exists():
            thumb_path.unlink()
        preview_path = PREVIEWS_DIR / f"{f['id']}.jpg"
        if preview_path.exists():
            preview_path.unlink()
    await db.files.delete_many({'folder_id': folder_id})
    
    # Recursively delete subfolders
    subfolders = await db.folders.find({'parent_id': folder_id}, {'_id': 0}).to_list(1000)
    for sf in subfolders:
        await delete_folder(sf['id'], admin)
    
    # Delete shares
    await db.shares.delete_many({'folder_id': folder_id})
    
    # Delete folder
    await db.folders.delete_one({'id': folder_id})
    return {"message": "Folder deleted"}

@api_router.get("/folders/{folder_id}/path")
async def get_folder_path(folder_id: str, admin = Depends(get_current_admin)):
    path = []
    current_id = folder_id
    while current_id:
        folder = await db.folders.find_one({'id': current_id}, {'_id': 0})
        if not folder:
            break
        path.insert(0, {'id': folder['id'], 'name': folder['name']})
        current_id = folder.get('parent_id')
    return path

# ==================== FILE ROUTES ====================

@api_router.post("/files/upload")
async def upload_file(
    folder_id: str = Form(...),
    file: UploadFile = File(...),
    admin = Depends(get_current_admin)
):
    # Verify folder exists
    folder = await db.folders.find_one({'id': folder_id})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    file_id = str(uuid.uuid4())
    ext = Path(file.filename).suffix.lower()
    stored_name = f"{file_id}{ext}"
    file_path = FILES_DIR / stored_name
    
    # Determine file type
    image_exts = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'}
    video_exts = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'}
    
    if ext in image_exts:
        file_type = 'image'
    elif ext in video_exts:
        file_type = 'video'
    else:
        file_type = 'other'
    
    # Stream file to disk in chunks (memory efficient for large files)
    file_size = 0
    chunk_size = 1024 * 1024  # 1MB chunks
    async with aiofiles.open(file_path, 'wb') as f:
        while chunk := await file.read(chunk_size):
            await f.write(chunk)
            file_size += len(chunk)
    
    # Generate thumbnails for images
    thumbnail_url = None
    preview_url = None
    if file_type == 'image':
        await generate_thumbnail(file_path, file_id)
        await generate_preview(file_path, file_id)
        thumbnail_url = f"/api/files/{file_id}/thumbnail"
        preview_url = f"/api/files/{file_id}/preview"
    
    file_doc = {
        'id': file_id,
        'name': file.filename,
        'folder_id': folder_id,
        'stored_name': stored_name,
        'file_type': file_type,
        'size': file_size,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.files.insert_one(file_doc)
    
    return FileResponseModel(
        id=file_id,
        name=file.filename,
        folder_id=folder_id,
        file_type=file_type,
        size=file_size,
        created_at=file_doc['created_at'],
        thumbnail_url=thumbnail_url,
        preview_url=preview_url
    )

@api_router.get("/files", response_model=List[FileResponseModel])
async def get_files(folder_id: str, admin = Depends(get_current_admin)):
    files = await db.files.find({'folder_id': folder_id}, {'_id': 0}).to_list(1000)
    result = []
    for f in files:
        thumbnail_url = None
        preview_url = None
        if f['file_type'] == 'image':
            thumbnail_url = f"/api/files/{f['id']}/thumbnail"
            preview_url = f"/api/files/{f['id']}/preview"
        result.append(FileResponseModel(
            id=f['id'],
            name=f['name'],
            folder_id=f['folder_id'],
            file_type=f['file_type'],
            size=f['size'],
            created_at=f['created_at'],
            thumbnail_url=thumbnail_url,
            preview_url=preview_url
        ))
    return result

@api_router.get("/files/{file_id}/thumbnail")
async def get_thumbnail(file_id: str):
    thumb_path = THUMBNAILS_DIR / f"{file_id}.jpg"
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FastAPIFileResponse(thumb_path, media_type="image/jpeg")

@api_router.get("/files/{file_id}/preview")
async def get_preview(file_id: str):
    preview_path = PREVIEWS_DIR / f"{file_id}.jpg"
    if not preview_path.exists():
        raise HTTPException(status_code=404, detail="Preview not found")
    return FastAPIFileResponse(preview_path, media_type="image/jpeg")

@api_router.get("/folders/{folder_id}/download-zip")
async def download_folder_as_zip(folder_id: str, token: Optional[str] = None, admin = Depends(get_current_admin)):
    """Download all files in a folder as a ZIP archive"""
    import zipfile
    import tempfile
    
    # Also allow token-based auth via query param for direct downloads
    if not admin and token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            username = payload.get('sub')
            admin = await db.admins.find_one({'username': username}, {'_id': 0})
        except:
            pass
    
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    folder = await db.folders.find_one({'id': folder_id}, {'_id': 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    files = await db.files.find({'folder_id': folder_id}, {'_id': 0}).to_list(10000)
    if not files:
        raise HTTPException(status_code=404, detail="No files in folder")
    
    # Create temporary zip file
    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
    
    try:
        with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_STORED) as zf:
            for file_doc in files:
                file_path = FILES_DIR / file_doc['stored_name']
                if file_path.exists():
                    # Add file to zip with original name (no compression for speed)
                    zf.write(file_path, file_doc['name'])
        
        # Return the zip file
        zip_filename = f"{folder['name']}.zip"
        return FastAPIFileResponse(
            temp_zip.name, 
            filename=zip_filename,
            media_type='application/zip',
            background=BackgroundTask(lambda: Path(temp_zip.name).unlink(missing_ok=True))
        )
    except Exception as e:
        Path(temp_zip.name).unlink(missing_ok=True)
        logger.error(f"ZIP creation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create ZIP file")

@api_router.post("/files/download-zip")
async def download_files_as_zip(file_ids: List[str], admin = Depends(get_current_admin)):
    """Download selected files as a ZIP archive"""
    import zipfile
    import tempfile
    
    if not file_ids:
        raise HTTPException(status_code=400, detail="No files selected")
    
    # Create temporary zip file
    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
    
    try:
        with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zf:
            for file_id in file_ids:
                file_doc = await db.files.find_one({'id': file_id}, {'_id': 0})
                if file_doc:
                    file_path = FILES_DIR / file_doc['stored_name']
                    if file_path.exists():
                        zf.write(file_path, file_doc['name'])
        
        return FastAPIFileResponse(
            temp_zip.name, 
            filename='selected_files.zip',
            media_type='application/zip',
            background=BackgroundTask(lambda: Path(temp_zip.name).unlink(missing_ok=True))
        )
    except Exception as e:
        Path(temp_zip.name).unlink(missing_ok=True)
        logger.error(f"ZIP creation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create ZIP file")

@api_router.get("/files/{file_id}/download")
async def download_file(file_id: str):
    file_doc = await db.files.find_one({'id': file_id}, {'_id': 0})
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
    file_path = FILES_DIR / file_doc['stored_name']
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FastAPIFileResponse(file_path, filename=file_doc['name'])

@api_router.get("/files/{file_id}/stream")
async def stream_file(file_id: str):
    file_doc = await db.files.find_one({'id': file_id}, {'_id': 0})
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
    file_path = FILES_DIR / file_doc['stored_name']
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    ext = Path(file_doc['stored_name']).suffix.lower()
    media_types = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska'
    }
    media_type = media_types.get(ext, 'application/octet-stream')
    return FastAPIFileResponse(file_path, media_type=media_type)

@api_router.delete("/files/{file_id}")
async def delete_file(file_id: str, admin = Depends(get_current_admin)):
    file_doc = await db.files.find_one({'id': file_id}, {'_id': 0})
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Delete physical files
    file_path = FILES_DIR / file_doc['stored_name']
    if file_path.exists():
        file_path.unlink()
    thumb_path = THUMBNAILS_DIR / f"{file_id}.jpg"
    if thumb_path.exists():
        thumb_path.unlink()
    preview_path = PREVIEWS_DIR / f"{file_id}.jpg"
    if preview_path.exists():
        preview_path.unlink()
    
    await db.files.delete_one({'id': file_id})
    return {"message": "File deleted"}

# ==================== SHARE ROUTES ====================

@api_router.post("/shares", response_model=ShareResponse)
async def create_share(share: ShareCreate, admin = Depends(get_current_admin)):
    # Verify folder exists
    folder = await db.folders.find_one({'id': share.folder_id}, {'_id': 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Check if token already exists
    existing = await db.shares.find_one({'token': share.token})
    if existing:
        raise HTTPException(status_code=400, detail="Token already in use")
    
    share_doc = {
        'id': str(uuid.uuid4()),
        'folder_id': share.folder_id,
        'token': share.token,
        'permission': share.permission,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.shares.insert_one(share_doc)
    
    return ShareResponse(
        id=share_doc['id'],
        folder_id=share_doc['folder_id'],
        token=share_doc['token'],
        permission=share_doc['permission'],
        created_at=share_doc['created_at'],
        share_url=f"{SHARE_DOMAIN}/{share.token}",
        folder_name=folder['name']
    )

@api_router.get("/shares", response_model=List[ShareResponse])
async def get_shares(admin = Depends(get_current_admin)):
    shares = await db.shares.find({}, {'_id': 0}).to_list(1000)
    result = []
    for s in shares:
        folder = await db.folders.find_one({'id': s['folder_id']}, {'_id': 0})
        folder_name = folder['name'] if folder else 'Unknown'
        result.append(ShareResponse(
            id=s['id'],
            folder_id=s['folder_id'],
            token=s['token'],
            permission=s['permission'],
            created_at=s['created_at'],
            share_url=f"{SHARE_DOMAIN}/{s['token']}",
            folder_name=folder_name
        ))
    return result

@api_router.put("/shares/{share_id}", response_model=ShareResponse)
async def update_share(share_id: str, share: ShareUpdate, admin = Depends(get_current_admin)):
    result = await db.shares.update_one({'id': share_id}, {'$set': {'permission': share.permission}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Share not found")
    updated = await db.shares.find_one({'id': share_id}, {'_id': 0})
    folder = await db.folders.find_one({'id': updated['folder_id']}, {'_id': 0})
    return ShareResponse(
        id=updated['id'],
        folder_id=updated['folder_id'],
        token=updated['token'],
        permission=updated['permission'],
        created_at=updated['created_at'],
        share_url=f"{SHARE_DOMAIN}/{updated['token']}",
        folder_name=folder['name'] if folder else 'Unknown'
    )

@api_router.delete("/shares/{share_id}")
async def delete_share(share_id: str, admin = Depends(get_current_admin)):
    result = await db.shares.delete_one({'id': share_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Share not found")
    return {"message": "Share deleted"}

@api_router.get("/shares/{share_id}/qrcode")
async def get_share_qrcode(share_id: str, admin = Depends(get_current_admin)):
    share = await db.shares.find_one({'id': share_id}, {'_id': 0})
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    
    share_url = f"{SHARE_DOMAIN}/{share['token']}"
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(share_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#121212", back_color="white")
    
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    
    return StreamingResponse(buffer, media_type="image/png")

# ==================== PUBLIC GALLERY ROUTES ====================

@api_router.get("/gallery/{token}")
async def get_gallery_by_token(token: str):
    share = await db.shares.find_one({'token': token}, {'_id': 0})
    if not share:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    folder = await db.folders.find_one({'id': share['folder_id']}, {'_id': 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    return {
        'folder_id': folder['id'],
        'folder_name': folder['name'],
        'permission': share['permission']
    }

@api_router.get("/gallery/{token}/folders")
async def get_gallery_folders(token: str, parent_id: Optional[str] = None):
    share = await db.shares.find_one({'token': token}, {'_id': 0})
    if not share:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # If no parent_id, use the share's folder as root
    if parent_id is None:
        parent_id = share['folder_id']
        # Return the root folder's subfolders
        folders = await db.folders.find({'parent_id': parent_id}, {'_id': 0}).to_list(1000)
    else:
        # Verify the requested folder is within the share hierarchy
        if not await is_folder_in_share(parent_id, share['folder_id']):
            raise HTTPException(status_code=403, detail="Access denied")
        folders = await db.folders.find({'parent_id': parent_id}, {'_id': 0}).to_list(1000)
    
    result = []
    for f in folders:
        file_count = await db.files.count_documents({'folder_id': f['id']})
        subfolder_count = await db.folders.count_documents({'parent_id': f['id']})
        result.append({
            'id': f['id'],
            'name': f['name'],
            'parent_id': f['parent_id'],
            'created_at': f['created_at'],
            'file_count': file_count,
            'subfolder_count': subfolder_count
        })
    return result

async def is_folder_in_share(folder_id: str, root_folder_id: str) -> bool:
    if folder_id == root_folder_id:
        return True
    current_id = folder_id
    while current_id:
        folder = await db.folders.find_one({'id': current_id}, {'_id': 0})
        if not folder:
            return False
        if folder.get('parent_id') == root_folder_id:
            return True
        current_id = folder.get('parent_id')
    return False

@api_router.get("/gallery/{token}/files")
async def get_gallery_files(token: str, folder_id: Optional[str] = None):
    share = await db.shares.find_one({'token': token}, {'_id': 0})
    if not share:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    target_folder = folder_id or share['folder_id']
    
    # Verify access
    if folder_id and not await is_folder_in_share(folder_id, share['folder_id']):
        raise HTTPException(status_code=403, detail="Access denied")
    
    files = await db.files.find({'folder_id': target_folder}, {'_id': 0}).to_list(1000)
    result = []
    for f in files:
        thumbnail_url = None
        preview_url = None
        if f['file_type'] == 'image':
            thumbnail_url = f"/api/files/{f['id']}/thumbnail"
            preview_url = f"/api/files/{f['id']}/preview"
        result.append({
            'id': f['id'],
            'name': f['name'],
            'folder_id': f['folder_id'],
            'file_type': f['file_type'],
            'size': f['size'],
            'created_at': f['created_at'],
            'thumbnail_url': thumbnail_url,
            'preview_url': preview_url
        })
    return result

@api_router.get("/gallery/{token}/path")
async def get_gallery_path(token: str, folder_id: str):
    share = await db.shares.find_one({'token': token}, {'_id': 0})
    if not share:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    path = []
    current_id = folder_id
    while current_id and current_id != share['folder_id']:
        folder = await db.folders.find_one({'id': current_id}, {'_id': 0})
        if not folder:
            break
        path.insert(0, {'id': folder['id'], 'name': folder['name']})
        current_id = folder.get('parent_id')
    
    # Add root folder
    root_folder = await db.folders.find_one({'id': share['folder_id']}, {'_id': 0})
    if root_folder:
        path.insert(0, {'id': root_folder['id'], 'name': root_folder['name']})
    
    return path

# ==================== STATS ROUTE ====================

@api_router.get("/stats")
async def get_stats(admin = Depends(get_current_admin)):
    folder_count = await db.folders.count_documents({})
    file_count = await db.files.count_documents({})
    share_count = await db.shares.count_documents({})
    
    # Calculate total size
    pipeline = [{'$group': {'_id': None, 'total': {'$sum': '$size'}}}]
    result = await db.files.aggregate(pipeline).to_list(1)
    total_size = result[0]['total'] if result else 0
    
    return {
        'folder_count': folder_count,
        'file_count': file_count,
        'share_count': share_count,
        'total_size': total_size
    }

# ==================== ROOT ROUTE ====================

@api_router.get("/")
async def root():
    return {"message": "Weddings By Mark Gallery API"}

# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
