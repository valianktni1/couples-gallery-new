#!/usr/bin/env python3
"""
Nextcloud to Couples Gallery Migration Script
Copies folders and files from Nextcloud to the new gallery system.

Usage: docker exec -it gallery-api python /app/migrate_nextcloud.py /source/weddings
"""

import os
import sys
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image
import asyncio

# Configuration
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://mongodb:27017')
DB_NAME = os.environ.get('DB_NAME', 'couples_gallery')
FILES_DIR = Path(os.environ.get('FILES_DIR', '/app/files'))
THUMBNAILS_DIR = Path('/app/data/thumbnails')
PREVIEWS_DIR = Path('/app/data/previews')

# Image extensions
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff'}
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv'}

# Stats
stats = {
    'folders_created': 0,
    'files_copied': 0,
    'files_skipped': 0,
    'bytes_copied': 0,
    'errors': []
}

def get_file_type(filename):
    ext = Path(filename).suffix.lower()
    if ext in IMAGE_EXTENSIONS:
        return 'image'
    elif ext in VIDEO_EXTENSIONS:
        return 'video'
    return 'other'

def generate_thumbnail(file_path: Path, file_id: str):
    """Generate thumbnail for image files"""
    try:
        with Image.open(file_path) as img:
            img.thumbnail((300, 300), Image.Resampling.LANCZOS)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            thumb_path = THUMBNAILS_DIR / f"{file_id}.jpg"
            img.save(thumb_path, 'JPEG', quality=85)
            return True
    except Exception as e:
        return False

def generate_preview(file_path: Path, file_id: str, max_size: int = 1500):
    """Generate preview for image files"""
    try:
        with Image.open(file_path) as img:
            ratio = min(max_size / img.width, max_size / img.height)
            if ratio < 1:
                new_size = (int(img.width * ratio), int(img.height * ratio))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            preview_path = PREVIEWS_DIR / f"{file_id}.jpg"
            img.save(preview_path, 'JPEG', quality=90)
            return True
    except Exception as e:
        return False

async def migrate(source_path: str, dry_run: bool = False):
    """Main migration function"""
    source = Path(source_path)
    
    if not source.exists():
        print(f"ERROR: Source path does not exist: {source_path}")
        sys.exit(1)
    
    print(f"\n{'='*60}")
    print(f"NEXTCLOUD TO GALLERY MIGRATION")
    print(f"{'='*60}")
    print(f"Source: {source_path}")
    print(f"Destination: {FILES_DIR}")
    print(f"Mode: {'DRY RUN (no changes)' if dry_run else 'LIVE'}")
    print(f"{'='*60}\n")
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Get list of couple folders
    couple_folders = [f for f in source.iterdir() if f.is_dir()]
    print(f"Found {len(couple_folders)} couple folders to migrate\n")
    
    for i, couple_folder in enumerate(sorted(couple_folders), 1):
        couple_name = couple_folder.name
        print(f"[{i}/{len(couple_folders)}] Processing: {couple_name}")
        
        # Check if folder already exists
        existing = await db.folders.find_one({'name': couple_name, 'parent_id': None})
        if existing:
            print(f"  ⚠ Folder already exists, skipping...")
            continue
        
        # Create main couple folder
        couple_id = str(uuid.uuid4())
        if not dry_run:
            await db.folders.insert_one({
                'id': couple_id,
                'name': couple_name,
                'parent_id': None,
                'created_at': datetime.now(timezone.utc).isoformat()
            })
        stats['folders_created'] += 1
        print(f"  ✓ Created folder: {couple_name}")
        
        # Process subfolders and files
        await process_directory(db, couple_folder, couple_id, dry_run, indent=2)
    
    # Print summary
    print(f"\n{'='*60}")
    print("MIGRATION COMPLETE")
    print(f"{'='*60}")
    print(f"Folders created: {stats['folders_created']}")
    print(f"Files copied: {stats['files_copied']}")
    print(f"Files skipped: {stats['files_skipped']}")
    print(f"Data copied: {stats['bytes_copied'] / (1024*1024*1024):.2f} GB")
    
    if stats['errors']:
        print(f"\nErrors ({len(stats['errors'])}):")
        for err in stats['errors'][:10]:
            print(f"  - {err}")
        if len(stats['errors']) > 10:
            print(f"  ... and {len(stats['errors']) - 10} more")
    
    client.close()

async def process_directory(db, source_dir: Path, parent_id: str, dry_run: bool, indent: int = 0):
    """Process a directory - create subfolders and copy files"""
    prefix = "  " * indent
    
    # Process files in this directory
    files = [f for f in source_dir.iterdir() if f.is_file()]
    for file_path in files:
        await copy_file(db, file_path, parent_id, dry_run, prefix)
    
    # Process subdirectories
    subdirs = [d for d in source_dir.iterdir() if d.is_dir()]
    for subdir in subdirs:
        subdir_name = subdir.name
        
        # Create subfolder
        subfolder_id = str(uuid.uuid4())
        if not dry_run:
            await db.folders.insert_one({
                'id': subfolder_id,
                'name': subdir_name,
                'parent_id': parent_id,
                'created_at': datetime.now(timezone.utc).isoformat()
            })
        stats['folders_created'] += 1
        print(f"{prefix}  ✓ Subfolder: {subdir_name}")
        
        # Recursively process
        await process_directory(db, subdir, subfolder_id, dry_run, indent + 1)

async def copy_file(db, source_file: Path, folder_id: str, dry_run: bool, prefix: str):
    """Copy a single file and register in database"""
    filename = source_file.name
    
    # Skip hidden files and system files
    if filename.startswith('.') or filename.startswith('_'):
        stats['files_skipped'] += 1
        return
    
    file_id = str(uuid.uuid4())
    file_type = get_file_type(filename)
    ext = source_file.suffix
    stored_name = f"{file_id}{ext}"
    dest_path = FILES_DIR / stored_name
    
    try:
        file_size = source_file.stat().st_size
        
        if not dry_run:
            # Copy file
            shutil.copy2(source_file, dest_path)
            
            # Generate thumbnails for images
            if file_type == 'image':
                generate_thumbnail(dest_path, file_id)
                generate_preview(dest_path, file_id)
            
            # Register in database
            await db.files.insert_one({
                'id': file_id,
                'name': filename,
                'folder_id': folder_id,
                'stored_name': stored_name,
                'file_type': file_type,
                'size': file_size,
                'created_at': datetime.now(timezone.utc).isoformat()
            })
        
        stats['files_copied'] += 1
        stats['bytes_copied'] += file_size
        
    except Exception as e:
        stats['errors'].append(f"{source_file}: {str(e)}")
        stats['files_skipped'] += 1

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python migrate_nextcloud.py /path/to/nextcloud/weddings [--dry-run]")
        sys.exit(1)
    
    source_path = sys.argv[1]
    dry_run = '--dry-run' in sys.argv
    
    asyncio.run(migrate(source_path, dry_run))
