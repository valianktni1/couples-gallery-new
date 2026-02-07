from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Query, BackgroundTasks, Request
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

# Activity logging helper
async def log_activity(action: str, share_token: str = None, folder_name: str = None, file_name: str = None, details: dict = None, ip_address: str = None):
    """Log client activity for tracking"""
    log_entry = {
        'id': str(uuid.uuid4()),
        'action': action,  # 'gallery_view', 'file_download', 'zip_download', 'file_upload'
        'share_token': share_token,
        'folder_name': folder_name,
        'file_name': file_name,
        'details': details or {},
        'ip_address': ip_address,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.activity_logs.insert_one(log_entry)

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

# ==================== PRINT ORDER MODELS ====================

class PrintProduct(BaseModel):
    name: str
    size: str
    paper_type: str  # gloss, luster
    price: float = 0.0
    active: bool = True

class PrintProductUpdate(BaseModel):
    price: Optional[float] = None
    active: Optional[bool] = None

class OrderItem(BaseModel):
    file_id: str
    file_name: str
    product_id: str
    product_name: str
    size: str
    paper_type: str
    quantity: int = 1
    price: float

class DeliveryAddress(BaseModel):
    name: str
    line1: str
    line2: Optional[str] = ""
    city: str
    county: Optional[str] = ""
    postcode: str
    phone: str

class OrderCreate(BaseModel):
    share_token: str
    customer_email: str
    delivery_address: DeliveryAddress
    items: List[OrderItem]
    shipping: float = 2.50

class OrderStatusUpdate(BaseModel):
    status: str  # pending, paid, processing, shipped, completed, cancelled

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

async def generate_preview(file_path: Path, file_id: str, max_size: int = 400) -> Optional[str]:
    try:
        with Image.open(file_path) as img:
            ratio = min(max_size / img.width, max_size / img.height)
            if ratio < 1:
                new_size = (int(img.width * ratio), int(img.height * ratio))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            preview_path = PREVIEWS_DIR / f"{file_id}.jpg"
            img.save(preview_path, 'JPEG', quality=75)
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

@api_router.get("/folders/all", response_model=List[FolderResponse])
async def get_all_folders(admin = Depends(get_current_admin)):
    """Get all folders including subfolders with full path names"""
    all_folders = await db.folders.find({}, {'_id': 0}).to_list(1000)
    
    # Build path names for each folder
    async def get_path_name(folder):
        path_parts = [folder['name']]
        current = folder
        while current.get('parent_id'):
            parent = await db.folders.find_one({'id': current['parent_id']}, {'_id': 0})
            if parent:
                path_parts.insert(0, parent['name'])
                current = parent
            else:
                break
        return ' / '.join(path_parts)
    
    result = []
    for f in all_folders:
        file_count = await db.files.count_documents({'folder_id': f['id']})
        subfolder_count = await db.folders.count_documents({'parent_id': f['id']})
        path_name = await get_path_name(f)
        folder_with_path = {**f, 'name': path_name}
        result.append(FolderResponse(**folder_with_path, file_count=file_count, subfolder_count=subfolder_count))
    return result

@api_router.get("/folders/{folder_id}", response_model=FolderResponse)
async def get_folder(folder_id: str, admin = Depends(get_current_admin)):
    folder = await db.folders.find_one({'id': folder_id}, {'_id': 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    file_count = await db.files.count_documents({'folder_id': folder_id})
    subfolder_count = await db.folders.count_documents({'parent_id': folder_id})
    return FolderResponse(**folder, file_count=file_count, subfolder_count=subfolder_count)

@api_router.post("/folders/{folder_id}/duplicate", response_model=FolderResponse)
async def duplicate_folder(folder_id: str, admin = Depends(get_current_admin)):
    """Duplicate a folder and all its subfolders (without files)"""
    original = await db.folders.find_one({'id': folder_id}, {'_id': 0})
    if not original:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    async def copy_folder(src_folder, new_parent_id):
        """Recursively copy folder structure"""
        new_folder = {
            'id': str(uuid.uuid4()),
            'name': src_folder['name'] + ' (Copy)' if new_parent_id == src_folder.get('parent_id') else src_folder['name'],
            'parent_id': new_parent_id,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        await db.folders.insert_one(new_folder)
        
        # Copy subfolders recursively
        subfolders = await db.folders.find({'parent_id': src_folder['id']}, {'_id': 0}).to_list(1000)
        for sf in subfolders:
            await copy_folder(sf, new_folder['id'])
        
        return new_folder
    
    # Create the duplicate
    new_folder = await copy_folder(original, original.get('parent_id'))
    
    file_count = 0
    subfolder_count = await db.folders.count_documents({'parent_id': new_folder['id']})
    return FolderResponse(**new_folder, file_count=file_count, subfolder_count=subfolder_count)

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
async def download_folder_as_zip(folder_id: str, token: Optional[str] = None):
    """Download all files in a folder as a ZIP archive"""
    import zipfile
    import tempfile
    
    # Authenticate via URL token
    admin = None
    if token:
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
async def download_file(file_id: str, request: Request):
    file_doc = await db.files.find_one({'id': file_id}, {'_id': 0})
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
    file_path = FILES_DIR / file_doc['stored_name']
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Log download - get folder name and share token for context
    folder = await db.folders.find_one({'id': file_doc['folder_id']}, {'_id': 0})
    folder_name = folder['name'] if folder else 'Unknown'
    
    # Find share token if this folder is shared
    share = await db.shares.find_one({'folder_id': file_doc['folder_id']}, {'_id': 0})
    share_token = share['token'] if share else None
    
    ip = request.headers.get('X-Forwarded-For', request.client.host if request.client else 'unknown')
    await log_activity('file_download', share_token=share_token, folder_name=folder_name, file_name=file_doc['name'], ip_address=ip)
    
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
async def get_gallery_by_token(token: str, request: Request):
    share = await db.shares.find_one({'token': token}, {'_id': 0})
    if not share:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    folder = await db.folders.find_one({'id': share['folder_id']}, {'_id': 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Log gallery view
    ip = request.headers.get('X-Forwarded-For', request.client.host if request.client else 'unknown')
    await log_activity('gallery_view', share_token=token, folder_name=folder['name'], ip_address=ip)
    
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

# ==================== PUBLIC UPLOAD ====================

MAX_PUBLIC_UPLOAD_SIZE = 500 * 1024 * 1024  # 500MB limit for public uploads

@api_router.post("/gallery/{token}/upload")
async def public_upload(token: str, folder_id: str = Form(...), file: UploadFile = File(...), request: Request = None):
    """Allow guests to upload files via share link (edit/full permission) - max 500MB"""
    share = await db.shares.find_one({'token': token}, {'_id': 0})
    if not share:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    if share['permission'] not in ['edit', 'full']:
        raise HTTPException(status_code=403, detail="Upload not allowed")
    
    # Verify folder is within share
    if not await is_folder_in_share(folder_id, share['folder_id']):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Save file
    file_ext = Path(file.filename).suffix.lower()
    stored_name = f"{uuid.uuid4()}{file_ext}"
    file_path = FILES_DIR / stored_name
    
    async with aiofiles.open(file_path, 'wb') as f:
        while chunk := await file.read(1024 * 1024):
            await f.write(chunk)
    
    file_size = file_path.stat().st_size
    file_type = 'image' if file_ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp'] else 'video' if file_ext in ['.mp4', '.mov', '.avi', '.mkv'] else 'other'
    
    file_doc = {
        'id': str(uuid.uuid4()),
        'name': file.filename,
        'folder_id': folder_id,
        'stored_name': stored_name,
        'file_type': file_type,
        'size': file_size,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.files.insert_one(file_doc)
    
    # Generate thumbnail for images
    if file_type == 'image':
        try:
            await generate_thumbnail(file_path, file_doc['id'])
            await generate_preview(file_path, file_doc['id'])
        except Exception as e:
            logger.error(f"Thumbnail generation failed: {e}")
    
    # Log upload activity
    folder = await db.folders.find_one({'id': folder_id}, {'_id': 0})
    folder_name = folder['name'] if folder else 'Unknown'
    ip = request.client.host if request else None
    await log_activity('file_upload', share_token=token, folder_name=folder_name, file_name=file.filename, ip_address=ip)
    
    return {'id': file_doc['id'], 'name': file_doc['name'], 'message': 'Upload successful'}

# ==================== PUBLIC ZIP DOWNLOAD ====================

@api_router.get("/gallery/{token}/download-zip")
async def download_gallery_zip(token: str, folder_id: Optional[str] = None, request: Request = None):
    """Download all files in gallery folder as ZIP (for clients)"""
    import zipfile
    import tempfile
    
    share = await db.shares.find_one({'token': token}, {'_id': 0})
    if not share:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Use share's root folder if no folder_id specified
    target_folder_id = folder_id if folder_id else share['folder_id']
    
    # Verify folder is within share hierarchy
    if folder_id and not await is_folder_in_share(folder_id, share['folder_id']):
        raise HTTPException(status_code=403, detail="Access denied")
    
    files = await db.files.find({'folder_id': target_folder_id}, {'_id': 0}).to_list(10000)
    if not files:
        raise HTTPException(status_code=404, detail="No files in folder")
    
    # Get folder name for zip filename
    folder = await db.folders.find_one({'id': target_folder_id}, {'_id': 0})
    folder_name = folder['name'] if folder else 'gallery'
    
    # Log ZIP download
    ip = request.client.host if request else None
    file_count = len(files)
    await log_activity('zip_download', share_token=token, folder_name=folder_name, 
                       details={'file_count': file_count}, ip_address=ip)
    
    # Create temporary zip file
    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
    
    try:
        with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_STORED) as zf:
            for file_doc in files:
                file_path = FILES_DIR / file_doc['stored_name']
                if file_path.exists():
                    zf.write(file_path, file_doc['name'])
        
        zip_filename = f"{folder_name}.zip"
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

# ==================== ACTIVITY LOGS ====================

@api_router.get("/activity-logs")
async def get_activity_logs(admin = Depends(get_current_admin), limit: int = 100, skip: int = 0, search: str = None):
    """Get activity logs for admin with optional search"""
    # Auto-cleanup: Delete logs older than 400 days
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=400)).isoformat()
    await db.activity_logs.delete_many({'created_at': {'$lt': cutoff_date}})
    
    # Build query with optional search
    query = {}
    if search:
        query['$or'] = [
            {'folder_name': {'$regex': search, '$options': 'i'}},
            {'share_token': {'$regex': search, '$options': 'i'}},
            {'file_name': {'$regex': search, '$options': 'i'}}
        ]
    
    logs = await db.activity_logs.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    total = await db.activity_logs.count_documents(query)
    return {'logs': logs, 'total': total}

@api_router.delete("/activity-logs")
async def clear_activity_logs(admin = Depends(get_current_admin)):
    """Clear all activity logs"""
    result = await db.activity_logs.delete_many({})
    return {'deleted': result.deleted_count}

# ==================== FAVOURITES ROUTE ====================

class FavouritesRequest(BaseModel):
    file_ids: List[str]

@api_router.post("/gallery/{token}/favourites")
async def save_favourites(token: str, request: FavouritesRequest):
    """Save selected photos to Album Favourites folder"""
    import shutil
    
    share = await db.shares.find_one({'token': token}, {'_id': 0})
    if not share:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Check permission - need edit or full
    if share['permission'] not in ['edit', 'full']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if not request.file_ids:
        raise HTTPException(status_code=400, detail="No files selected")
    
    root_folder_id = share['folder_id']
    
    # Check if Album Favourites folder exists, create if not
    favourites_folder = await db.folders.find_one({
        'name': 'Album Favourites',
        'parent_id': root_folder_id
    }, {'_id': 0})
    
    if not favourites_folder:
        # Create the folder
        favourites_folder = {
            'id': str(uuid.uuid4()),
            'name': 'Album Favourites',
            'parent_id': root_folder_id,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        await db.folders.insert_one(favourites_folder)
        logger.info(f"Created Album Favourites folder: {favourites_folder['id']}")
    
    favourites_folder_id = favourites_folder['id']
    copied_count = 0
    
    for file_id in request.file_ids:
        # Get original file
        original_file = await db.files.find_one({'id': file_id}, {'_id': 0})
        if not original_file:
            continue
        
        # Check if already in favourites (by name)
        existing = await db.files.find_one({
            'folder_id': favourites_folder_id,
            'name': original_file['name']
        }, {'_id': 0})
        
        if existing:
            # Skip if already exists
            continue
        
        # Copy the physical file
        original_path = FILES_DIR / original_file['stored_name']
        if not original_path.exists():
            continue
        
        # Generate new stored name for the copy
        new_stored_name = f"{uuid.uuid4()}{Path(original_file['name']).suffix}"
        new_path = FILES_DIR / new_stored_name
        
        try:
            shutil.copy2(original_path, new_path)
            
            # Create new file record
            new_file = {
                'id': str(uuid.uuid4()),
                'name': original_file['name'],
                'folder_id': favourites_folder_id,
                'stored_name': new_stored_name,
                'file_type': original_file['file_type'],
                'size': original_file['size'],
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            await db.files.insert_one(new_file)
            
            # Also copy thumbnail and preview if they exist
            if original_file['file_type'] == 'image':
                orig_thumb = THUMBNAILS_DIR / f"{original_file['id']}.jpg"
                orig_preview = PREVIEWS_DIR / f"{original_file['id']}.jpg"
                
                if orig_thumb.exists():
                    shutil.copy2(orig_thumb, THUMBNAILS_DIR / f"{new_file['id']}.jpg")
                if orig_preview.exists():
                    shutil.copy2(orig_preview, PREVIEWS_DIR / f"{new_file['id']}.jpg")
            
            copied_count += 1
            
        except Exception as e:
            logger.error(f"Failed to copy file {file_id}: {e}")
            continue
    
    return {
        'success': True,
        'copied_count': copied_count,
        'folder_id': favourites_folder_id,
        'message': f'{copied_count} photos saved to Album Favourites'
    }

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

# ==================== PRINT PRODUCTS ROUTES ====================

@api_router.get("/print-products")
async def get_print_products(active_only: bool = False):
    """Get all print products (public endpoint for gallery)"""
    query = {'active': True} if active_only else {}
    products = await db.print_products.find(query, {'_id': 0}).to_list(100)
    return products

@api_router.post("/print-products")
async def create_print_product(product: PrintProduct, admin = Depends(get_current_admin)):
    """Create a new print product"""
    product_doc = {
        'id': str(uuid.uuid4()),
        'name': product.name,
        'size': product.size,
        'paper_type': product.paper_type,
        'price': product.price,
        'active': product.active,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.print_products.insert_one(product_doc)
    return {k: v for k, v in product_doc.items() if k != '_id'}

@api_router.put("/print-products/{product_id}")
async def update_print_product(product_id: str, update: PrintProductUpdate, admin = Depends(get_current_admin)):
    """Update a print product (price, active status)"""
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.print_products.update_one(
        {'id': product_id},
        {'$set': update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return {"message": "Product updated"}

@api_router.delete("/print-products/{product_id}")
async def delete_print_product(product_id: str, admin = Depends(get_current_admin)):
    """Delete a print product"""
    result = await db.print_products.delete_one({'id': product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}

@api_router.post("/print-products/init")
async def init_print_products(admin = Depends(get_current_admin)):
    """Initialize default print products (run once)"""
    existing = await db.print_products.count_documents({})
    if existing > 0:
        return {"message": "Products already initialized", "count": existing}
    
    sizes = ["6x4", "7x5", "10x8", "12x8", "20x16", "30x20"]
    paper_types = ["matte", "lustre", "silk", "gloss"]
    canvas_sizes = ["12x8", "16x12", "20x16", "30x20"]
    
    default_products = []
    
    # Print papers
    for paper in paper_types:
        for size in sizes:
            default_products.append({
                "name": f"{size} {paper.capitalize()}",
                "size": size,
                "paper_type": paper,
                "price": 0,
                "active": True
            })
    
    # Canvas
    for size in canvas_sizes:
        default_products.append({
            "name": f"{size} Canvas",
            "size": size,
            "paper_type": "canvas",
            "price": 0,
            "active": True
        })
    
    for product in default_products:
        product['id'] = str(uuid.uuid4())
        product['created_at'] = datetime.now(timezone.utc).isoformat()
        await db.print_products.insert_one(product)
    
    return {"message": "Products initialized", "count": len(default_products)}

# ==================== PRINT ORDERS ROUTES ====================

@api_router.post("/orders")
async def create_order(order: OrderCreate, request: Request):
    """Create a new print order (public endpoint)"""
    # Verify share token exists
    share = await db.shares.find_one({'token': order.share_token}, {'_id': 0})
    if not share:
        raise HTTPException(status_code=404, detail="Invalid gallery token")
    
    # Get folder name for reference
    folder = await db.folders.find_one({'id': share['folder_id']}, {'_id': 0})
    folder_name = folder['name'] if folder else 'Unknown'
    
    # Calculate total
    subtotal = sum(item.price * item.quantity for item in order.items)
    total = subtotal + order.shipping
    
    # Minimum order check
    if subtotal < 15.00:
        raise HTTPException(status_code=400, detail="Minimum order is £15 (before shipping)")
    
    # Create order document
    order_doc = {
        'id': str(uuid.uuid4()),
        'order_number': f"WBM-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}",
        'share_token': order.share_token,
        'gallery_name': folder_name,
        'customer_email': order.customer_email,
        'delivery_address': order.delivery_address.model_dump(),
        'items': [item.model_dump() for item in order.items],
        'subtotal': subtotal,
        'shipping': order.shipping,
        'total': total,
        'status': 'pending',  # pending, paid, processing, shipped, completed, cancelled
        'payment_id': None,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.orders.insert_one(order_doc)
    
    # Log activity
    ip = request.headers.get('X-Forwarded-For', request.client.host if request.client else 'unknown')
    await log_activity('order_created', share_token=order.share_token, folder_name=folder_name, 
                      details={'order_id': order_doc['id'], 'total': total, 'items': len(order.items)}, ip_address=ip)
    
    return {
        'order_id': order_doc['id'],
        'order_number': order_doc['order_number'],
        'total': total
    }

@api_router.get("/orders")
async def get_orders(admin = Depends(get_current_admin), status: Optional[str] = None, limit: int = 50, skip: int = 0):
    """Get all orders (admin only)"""
    query = {'status': status} if status else {}
    orders = await db.orders.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    total = await db.orders.count_documents(query)
    return {"orders": orders, "total": total}

@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, admin = Depends(get_current_admin)):
    """Get a specific order with full details (admin only)"""
    order = await db.orders.find_one({'id': order_id}, {'_id': 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get file thumbnails for each item
    for item in order.get('items', []):
        file_doc = await db.files.find_one({'id': item['file_id']}, {'_id': 0})
        if file_doc:
            item['thumbnail_url'] = f"/api/thumbnails/{item['file_id']}.jpg"
            item['original_filename'] = file_doc.get('name', item['file_name'])
    
    return order

@api_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, update: OrderStatusUpdate, admin = Depends(get_current_admin)):
    """Update order status (admin only)"""
    valid_statuses = ['pending', 'paid', 'processing', 'shipped', 'completed', 'cancelled']
    if update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    result = await db.orders.update_one(
        {'id': order_id},
        {'$set': {'status': update.status, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return {"message": f"Order status updated to {update.status}"}

@api_router.get("/orders/stats/summary")
async def get_order_stats(admin = Depends(get_current_admin)):
    """Get order statistics (admin only)"""
    total_orders = await db.orders.count_documents({})
    pending_orders = await db.orders.count_documents({'status': 'pending'})
    paid_orders = await db.orders.count_documents({'status': 'paid'})
    processing_orders = await db.orders.count_documents({'status': 'processing'})
    shipped_orders = await db.orders.count_documents({'status': 'shipped'})
    completed_orders = await db.orders.count_documents({'status': 'completed'})
    
    # Calculate total revenue from completed/shipped orders
    pipeline = [
        {'$match': {'status': {'$in': ['paid', 'processing', 'shipped', 'completed']}}},
        {'$group': {'_id': None, 'total': {'$sum': '$total'}}}
    ]
    result = await db.orders.aggregate(pipeline).to_list(1)
    total_revenue = result[0]['total'] if result else 0
    
    return {
        'total_orders': total_orders,
        'pending': pending_orders,
        'paid': paid_orders,
        'processing': processing_orders,
        'shipped': shipped_orders,
        'completed': completed_orders,
        'total_revenue': total_revenue
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
