"""
Backend API Tests for Wedding Gallery App
Tests: Admin auth, folder CRUD, file upload/delete, shares
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://markgallery.preview.emergentagent.com"

# Test credentials
TEST_USERNAME = "testadmin"
TEST_PASSWORD = "testpass123"


class TestSetupAndAuth:
    """Test setup status and authentication"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"API root response: {data}")
    
    def test_setup_status(self):
        """Test setup status endpoint"""
        response = requests.get(f"{BASE_URL}/api/setup/status")
        assert response.status_code == 200
        data = response.json()
        assert "setup_complete" in data
        print(f"Setup status: {data}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "invalid_user",
            "password": "invalid_pass"
        })
        assert response.status_code == 401
        print("Invalid login correctly rejected")
    
    def test_login_valid_credentials(self, auth_token):
        """Test login with valid credentials"""
        assert auth_token is not None
        assert len(auth_token) > 0
        print(f"Login successful, token length: {len(auth_token)}")
    
    def test_get_current_user(self, auth_token):
        """Test getting current user info"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "username" in data
        print(f"Current user: {data}")


class TestFolderCRUD:
    """Test folder CRUD operations"""
    
    def test_create_folder(self, auth_token):
        """Test creating a new folder"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        folder_name = f"TEST_Folder_{int(time.time())}"
        
        response = requests.post(f"{BASE_URL}/api/folders", 
            headers=headers,
            json={"name": folder_name, "parent_id": None}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == folder_name
        assert "id" in data
        print(f"Created folder: {data}")
        return data["id"]
    
    def test_get_folders(self, auth_token):
        """Test getting folders list"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/folders?parent_id=", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} root folders")
    
    def test_get_folder_by_id(self, auth_token, test_folder_id):
        """Test getting a specific folder"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/folders/{test_folder_id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_folder_id
        print(f"Got folder: {data}")
    
    def test_update_folder(self, auth_token, test_folder_id):
        """Test updating folder name"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        new_name = f"TEST_Renamed_{int(time.time())}"
        
        response = requests.put(f"{BASE_URL}/api/folders/{test_folder_id}",
            headers=headers,
            json={"name": new_name}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == new_name
        print(f"Renamed folder to: {new_name}")
    
    def test_get_folder_path(self, auth_token, test_folder_id):
        """Test getting folder path"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/folders/{test_folder_id}/path", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Folder path: {data}")
    
    def test_create_nested_folder(self, auth_token, test_folder_id):
        """Test creating a nested folder"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        subfolder_name = f"TEST_Subfolder_{int(time.time())}"
        
        response = requests.post(f"{BASE_URL}/api/folders",
            headers=headers,
            json={"name": subfolder_name, "parent_id": test_folder_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["parent_id"] == test_folder_id
        print(f"Created nested folder: {data}")
        return data["id"]


class TestFileOperations:
    """Test file upload and operations"""
    
    def test_upload_file(self, auth_token, test_folder_id):
        """Test file upload with progress tracking"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Create a test image file
        import io
        from PIL import Image
        
        img = Image.new('RGB', (100, 100), color='red')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        files = {'file': ('test_image.jpg', img_bytes, 'image/jpeg')}
        data = {'folder_id': test_folder_id}
        
        response = requests.post(f"{BASE_URL}/api/files/upload",
            headers=headers,
            files=files,
            data=data
        )
        assert response.status_code == 200
        result = response.json()
        assert "id" in result
        assert result["file_type"] == "image"
        print(f"Uploaded file: {result}")
        return result["id"]
    
    def test_get_files_in_folder(self, auth_token, test_folder_id):
        """Test getting files in a folder"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/files?folder_id={test_folder_id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} files in folder")
        return data
    
    def test_get_thumbnail(self, test_file_id):
        """Test getting file thumbnail"""
        response = requests.get(f"{BASE_URL}/api/files/{test_file_id}/thumbnail")
        assert response.status_code == 200
        assert response.headers.get('content-type') == 'image/jpeg'
        print("Thumbnail retrieved successfully")
    
    def test_get_preview(self, test_file_id):
        """Test getting file preview"""
        response = requests.get(f"{BASE_URL}/api/files/{test_file_id}/preview")
        assert response.status_code == 200
        assert response.headers.get('content-type') == 'image/jpeg'
        print("Preview retrieved successfully")
    
    def test_download_file(self, test_file_id):
        """Test file download"""
        response = requests.get(f"{BASE_URL}/api/files/{test_file_id}/download")
        assert response.status_code == 200
        print(f"File download successful, size: {len(response.content)} bytes")
    
    def test_delete_file(self, auth_token, test_file_id):
        """Test file deletion"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.delete(f"{BASE_URL}/api/files/{test_file_id}", headers=headers)
        assert response.status_code == 200
        print("File deleted successfully")
        
        # Verify deletion
        response = requests.get(f"{BASE_URL}/api/files/{test_file_id}/download")
        assert response.status_code == 404
        print("File deletion verified")


class TestShareOperations:
    """Test share link operations"""
    
    def test_create_share(self, auth_token, test_folder_id):
        """Test creating a share link"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        share_token = f"test-share-{int(time.time())}"
        
        response = requests.post(f"{BASE_URL}/api/shares",
            headers=headers,
            json={
                "folder_id": test_folder_id,
                "token": share_token,
                "permission": "read"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["token"] == share_token
        assert "share_url" in data
        print(f"Created share: {data}")
        return data["id"], share_token
    
    def test_get_shares(self, auth_token):
        """Test getting all shares"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/shares", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} shares")
    
    def test_update_share_permission(self, auth_token, test_share_id):
        """Test updating share permission"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.put(f"{BASE_URL}/api/shares/{test_share_id}",
            headers=headers,
            json={"permission": "edit"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["permission"] == "edit"
        print("Share permission updated to 'edit'")
    
    def test_get_share_qrcode(self, auth_token, test_share_id):
        """Test getting QR code for share"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/shares/{test_share_id}/qrcode", headers=headers)
        assert response.status_code == 200
        assert response.headers.get('content-type') == 'image/png'
        print("QR code generated successfully")
    
    def test_public_gallery_access(self, test_share_token):
        """Test public gallery access via token"""
        response = requests.get(f"{BASE_URL}/api/gallery/{test_share_token}")
        assert response.status_code == 200
        data = response.json()
        assert "folder_id" in data
        assert "permission" in data
        print(f"Public gallery access: {data}")
    
    def test_delete_share(self, auth_token, test_share_id):
        """Test deleting a share"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.delete(f"{BASE_URL}/api/shares/{test_share_id}", headers=headers)
        assert response.status_code == 200
        print("Share deleted successfully")


class TestStats:
    """Test stats endpoint"""
    
    def test_get_stats(self, auth_token):
        """Test getting dashboard stats"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "folder_count" in data
        assert "file_count" in data
        assert "share_count" in data
        assert "total_size" in data
        print(f"Stats: {data}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_delete_test_folder(self, auth_token, test_folder_id):
        """Delete test folder and all contents"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.delete(f"{BASE_URL}/api/folders/{test_folder_id}", headers=headers)
        assert response.status_code == 200
        print("Test folder deleted successfully")


# ==================== FIXTURES ====================

@pytest.fixture(scope="session")
def auth_token():
    """Get authentication token - try login first, then setup if needed"""
    # First check if setup is complete
    setup_response = requests.get(f"{BASE_URL}/api/setup/status")
    setup_data = setup_response.json()
    
    if not setup_data.get("setup_complete"):
        # Create admin account
        setup_response = requests.post(f"{BASE_URL}/api/setup/admin", json={
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD
        })
        if setup_response.status_code == 200:
            return setup_response.json().get("token")
    
    # Try to login
    login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": TEST_USERNAME,
        "password": TEST_PASSWORD
    })
    
    if login_response.status_code == 200:
        return login_response.json().get("token")
    
    # Try with default admin credentials
    login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin",
        "password": "admin123"
    })
    
    if login_response.status_code == 200:
        return login_response.json().get("token")
    
    pytest.skip("Could not authenticate - no valid credentials")


@pytest.fixture(scope="session")
def test_folder_id(auth_token):
    """Create a test folder for the session"""
    headers = {"Authorization": f"Bearer {auth_token}"}
    folder_name = f"TEST_Session_{int(time.time())}"
    
    response = requests.post(f"{BASE_URL}/api/folders",
        headers=headers,
        json={"name": folder_name, "parent_id": None}
    )
    
    if response.status_code == 200:
        folder_id = response.json()["id"]
        yield folder_id
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/folders/{folder_id}", headers=headers)
    else:
        pytest.skip("Could not create test folder")


@pytest.fixture(scope="session")
def test_file_id(auth_token, test_folder_id):
    """Upload a test file for the session"""
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    import io
    from PIL import Image
    
    img = Image.new('RGB', (100, 100), color='blue')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='JPEG')
    img_bytes.seek(0)
    
    files = {'file': ('test_session_image.jpg', img_bytes, 'image/jpeg')}
    data = {'folder_id': test_folder_id}
    
    response = requests.post(f"{BASE_URL}/api/files/upload",
        headers=headers,
        files=files,
        data=data
    )
    
    if response.status_code == 200:
        file_id = response.json()["id"]
        yield file_id
        # File will be deleted with folder
    else:
        pytest.skip("Could not upload test file")


@pytest.fixture(scope="session")
def test_share_id(auth_token, test_folder_id):
    """Create a test share for the session"""
    headers = {"Authorization": f"Bearer {auth_token}"}
    share_token = f"test-session-{int(time.time())}"
    
    response = requests.post(f"{BASE_URL}/api/shares",
        headers=headers,
        json={
            "folder_id": test_folder_id,
            "token": share_token,
            "permission": "read"
        }
    )
    
    if response.status_code == 200:
        share_id = response.json()["id"]
        yield share_id
        # Share will be deleted with folder
    else:
        pytest.skip("Could not create test share")


@pytest.fixture(scope="session")
def test_share_token(auth_token, test_folder_id):
    """Get test share token"""
    headers = {"Authorization": f"Bearer {auth_token}"}
    share_token = f"test-public-{int(time.time())}"
    
    response = requests.post(f"{BASE_URL}/api/shares",
        headers=headers,
        json={
            "folder_id": test_folder_id,
            "token": share_token,
            "permission": "read"
        }
    )
    
    if response.status_code == 200:
        yield share_token
    else:
        pytest.skip("Could not create test share token")
