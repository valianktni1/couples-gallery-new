import requests
import sys
import json
from datetime import datetime
import os
import tempfile
from pathlib import Path

class GalleryAPITester:
    def __init__(self, base_url="https://markgallery.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_folder_id = None
        self.test_file_id = None
        self.test_share_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    # Remove Content-Type for file uploads
                    headers.pop('Content-Type', None)
                    response = requests.post(url, headers=headers, files=files, data=data)
                else:
                    response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json() if response.content else {}
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response: {response.text}")

            return success, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_setup_status(self):
        """Test setup status endpoint"""
        success, response = self.run_test(
            "Setup Status Check",
            "GET",
            "setup/status",
            200
        )
        return success, response

    def test_setup_admin(self, username="mark", password="admin123"):
        """Test admin setup"""
        success, response = self.run_test(
            "Setup Admin Account",
            "POST",
            "setup/admin",
            200,
            data={"username": username, "password": password}
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Admin token obtained: {self.token[:20]}...")
            return True
        return False

    def test_login(self, username="mark", password="admin123"):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"username": username, "password": password}
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Login token obtained: {self.token[:20]}...")
            return True
        return False

    def test_get_me(self):
        """Test get current admin"""
        success, response = self.run_test(
            "Get Current Admin",
            "GET",
            "auth/me",
            200
        )
        return success

    def test_get_stats(self):
        """Test get stats"""
        success, response = self.run_test(
            "Get Stats",
            "GET",
            "stats",
            200
        )
        if success:
            print(f"   Stats: {response}")
        return success

    def test_create_folder(self, name="Test Gallery", parent_id=None):
        """Test folder creation"""
        success, response = self.run_test(
            "Create Folder",
            "POST",
            "folders",
            200,
            data={"name": name, "parent_id": parent_id}
        )
        if success and 'id' in response:
            self.test_folder_id = response['id']
            print(f"   Folder created with ID: {self.test_folder_id}")
            return True
        return False

    def test_get_folders(self, parent_id=None):
        """Test get folders"""
        endpoint = "folders"
        if parent_id is not None:
            endpoint += f"?parent_id={parent_id}"
        else:
            endpoint += "?parent_id="
            
        success, response = self.run_test(
            "Get Folders",
            "GET",
            endpoint,
            200
        )
        if success:
            print(f"   Found {len(response)} folders")
        return success

    def test_get_folder_by_id(self, folder_id):
        """Test get specific folder"""
        success, response = self.run_test(
            "Get Folder by ID",
            "GET",
            f"folders/{folder_id}",
            200
        )
        return success

    def test_update_folder(self, folder_id, new_name="Updated Test Gallery"):
        """Test folder update"""
        success, response = self.run_test(
            "Update Folder",
            "PUT",
            f"folders/{folder_id}",
            200,
            data={"name": new_name}
        )
        return success

    def test_get_folder_path(self, folder_id):
        """Test get folder path"""
        success, response = self.run_test(
            "Get Folder Path",
            "GET",
            f"folders/{folder_id}/path",
            200
        )
        return success

    def test_upload_file(self, folder_id):
        """Test file upload"""
        # Create a test image file
        test_content = b"fake image content for testing"
        
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_file:
            tmp_file.write(test_content)
            tmp_file_path = tmp_file.name

        try:
            with open(tmp_file_path, 'rb') as f:
                files = {'file': ('test_image.jpg', f, 'image/jpeg')}
                data = {'folder_id': folder_id}
                
                success, response = self.run_test(
                    "Upload File",
                    "POST",
                    "files/upload",
                    200,
                    data=data,
                    files=files
                )
                
                if success and 'id' in response:
                    self.test_file_id = response['id']
                    print(f"   File uploaded with ID: {self.test_file_id}")
                    return True
                return False
        finally:
            os.unlink(tmp_file_path)

    def test_get_files(self, folder_id):
        """Test get files in folder"""
        success, response = self.run_test(
            "Get Files",
            "GET",
            f"files?folder_id={folder_id}",
            200
        )
        if success:
            print(f"   Found {len(response)} files")
        return success

    def test_create_share(self, folder_id, token="testshare123", permission="read"):
        """Test create share link"""
        success, response = self.run_test(
            "Create Share Link",
            "POST",
            "shares",
            200,
            data={
                "folder_id": folder_id,
                "token": token,
                "permission": permission
            }
        )
        if success and 'id' in response:
            self.test_share_id = response['id']
            print(f"   Share created with ID: {self.test_share_id}")
            print(f"   Share URL: {response.get('share_url')}")
            return True
        return False

    def test_get_shares(self):
        """Test get all shares"""
        success, response = self.run_test(
            "Get Shares",
            "GET",
            "shares",
            200
        )
        if success:
            print(f"   Found {len(response)} shares")
        return success

    def test_update_share(self, share_id, permission="edit"):
        """Test update share permissions"""
        success, response = self.run_test(
            "Update Share",
            "PUT",
            f"shares/{share_id}",
            200,
            data={"permission": permission}
        )
        return success

    def test_get_share_qrcode(self, share_id):
        """Test get QR code for share"""
        url = f"{self.api_url}/shares/{share_id}/qrcode"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        print(f"\n🔍 Testing Get Share QR Code...")
        self.tests_run += 1
        
        try:
            response = requests.get(url, headers=headers)
            success = response.status_code == 200 and response.headers.get('content-type') == 'image/png'
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - QR Code generated (PNG, {len(response.content)} bytes)")
                return True
            else:
                print(f"❌ Failed - Status: {response.status_code}, Content-Type: {response.headers.get('content-type')}")
                return False
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False

    def test_gallery_public_access(self, token="testshare123"):
        """Test public gallery access"""
        success, response = self.run_test(
            "Public Gallery Access",
            "GET",
            f"gallery/{token}",
            200
        )
        return success

    def test_gallery_folders(self, token="testshare123"):
        """Test public gallery folders"""
        success, response = self.run_test(
            "Public Gallery Folders",
            "GET",
            f"gallery/{token}/folders",
            200
        )
        return success

    def test_gallery_files(self, token="testshare123"):
        """Test public gallery files"""
        success, response = self.run_test(
            "Public Gallery Files",
            "GET",
            f"gallery/{token}/files",
            200
        )
        return success

    def test_delete_file(self, file_id):
        """Test file deletion"""
        success, response = self.run_test(
            "Delete File",
            "DELETE",
            f"files/{file_id}",
            200
        )
        return success

    def test_delete_share(self, share_id):
        """Test share deletion"""
        success, response = self.run_test(
            "Delete Share",
            "DELETE",
            f"shares/{share_id}",
            200
        )
        return success

    def test_delete_folder(self, folder_id):
        """Test folder deletion"""
        success, response = self.run_test(
            "Delete Folder",
            "DELETE",
            f"folders/{folder_id}",
            200
        )
        return success

def main():
    print("🚀 Starting Couples Gallery API Tests")
    print("=" * 50)
    
    tester = GalleryAPITester()
    
    # Test setup status first
    setup_success, setup_data = tester.test_setup_status()
    if not setup_success:
        print("❌ Setup status check failed, stopping tests")
        return 1
    
    setup_complete = setup_data.get('setup_complete', False)
    print(f"Setup complete: {setup_complete}")
    
    # If setup not complete, run setup
    if not setup_complete:
        if not tester.test_setup_admin():
            print("❌ Admin setup failed, stopping tests")
            return 1
    else:
        # Setup already complete, try to login
        if not tester.test_login():
            print("❌ Login failed, stopping tests")
            return 1
    
    # Test authenticated endpoints
    if not tester.test_get_me():
        print("❌ Get current admin failed")
        return 1
    
    if not tester.test_get_stats():
        print("❌ Get stats failed")
        return 1
    
    # Test folder operations
    if not tester.test_create_folder():
        print("❌ Folder creation failed, stopping tests")
        return 1
    
    if not tester.test_get_folders():
        print("❌ Get folders failed")
        return 1
    
    if not tester.test_get_folder_by_id(tester.test_folder_id):
        print("❌ Get folder by ID failed")
        return 1
    
    if not tester.test_update_folder(tester.test_folder_id):
        print("❌ Update folder failed")
        return 1
    
    if not tester.test_get_folder_path(tester.test_folder_id):
        print("❌ Get folder path failed")
        return 1
    
    # Test file operations
    if not tester.test_upload_file(tester.test_folder_id):
        print("❌ File upload failed, stopping file tests")
    else:
        if not tester.test_get_files(tester.test_folder_id):
            print("❌ Get files failed")
    
    # Test share operations
    if not tester.test_create_share(tester.test_folder_id):
        print("❌ Share creation failed, stopping share tests")
    else:
        if not tester.test_get_shares():
            print("❌ Get shares failed")
        
        if not tester.test_update_share(tester.test_share_id):
            print("❌ Update share failed")
        
        if not tester.test_get_share_qrcode(tester.test_share_id):
            print("❌ Get QR code failed")
        
        # Test public gallery access
        if not tester.test_gallery_public_access():
            print("❌ Public gallery access failed")
        
        if not tester.test_gallery_folders():
            print("❌ Public gallery folders failed")
        
        if not tester.test_gallery_files():
            print("❌ Public gallery files failed")
    
    # Cleanup - delete created resources
    print("\n🧹 Cleaning up test resources...")
    if tester.test_file_id:
        tester.test_delete_file(tester.test_file_id)
    
    if tester.test_share_id:
        tester.test_delete_share(tester.test_share_id)
    
    if tester.test_folder_id:
        tester.test_delete_folder(tester.test_folder_id)
    
    # Print results
    print(f"\n📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    success_rate = (tester.tests_passed / tester.tests_run) * 100 if tester.tests_run > 0 else 0
    print(f"Success rate: {success_rate:.1f}%")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())