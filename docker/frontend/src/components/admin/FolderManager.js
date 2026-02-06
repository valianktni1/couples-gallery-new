import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen, FolderPlus, ChevronRight, Upload, Trash2, Download,
  Image, Film, MoreVertical, Edit2, ArrowLeft, X, Check, Eye,
  File as FileIcon, CheckSquare, Square, XCircle, Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function FolderManager({ onStatsChange }) {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentFolderId = searchParams.get('folder');
  
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [path, setPath] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Dialogs
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  
  // Upload
  const [uploadProgress, setUploadProgress] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [totalUploadProgress, setTotalUploadProgress] = useState({ current: 0, total: 0 });
  
  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchContent();
  }, [currentFolderId]);

  const fetchContent = async () => {
    setLoading(true);
    try {
      // Fetch folders
      const foldersUrl = currentFolderId 
        ? `${API}/folders?parent_id=${currentFolderId}`
        : `${API}/folders?parent_id=`;
      const foldersRes = await fetch(foldersUrl, { headers });
      if (foldersRes.ok) {
        setFolders(await foldersRes.json());
      }

      // Fetch files if in a folder
      if (currentFolderId) {
        const filesRes = await fetch(`${API}/files?folder_id=${currentFolderId}`, { headers });
        if (filesRes.ok) {
          setFiles(await filesRes.json());
        }

        // Fetch path
        const pathRes = await fetch(`${API}/folders/${currentFolderId}/path`, { headers });
        if (pathRes.ok) {
          setPath(await pathRes.json());
        }
      } else {
        setFiles([]);
        setPath([]);
      }
    } catch (e) {
      console.error('Failed to fetch content:', e);
      toast.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = (folderId) => {
    if (folderId) {
      setSearchParams({ folder: folderId });
    } else {
      setSearchParams({});
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      const res = await fetch(`${API}/folders`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName,
          parent_id: currentFolderId || null
        })
      });
      
      if (res.ok) {
        toast.success('Folder created');
        setShowNewFolder(false);
        setNewFolderName('');
        fetchContent();
        onStatsChange?.();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to create folder');
      }
    } catch (e) {
      toast.error('Failed to create folder');
    }
  };

  const updateFolder = async () => {
    if (!editingFolder || !editingFolder.newName.trim()) return;
    
    try {
      const res = await fetch(`${API}/folders/${editingFolder.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingFolder.newName })
      });
      
      if (res.ok) {
        toast.success('Folder renamed');
        setEditingFolder(null);
        fetchContent();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to rename folder');
      }
    } catch (e) {
      toast.error('Failed to rename folder');
    }
  };

  const deleteItem = async () => {
    if (!deleteTarget) return;
    
    try {
      const endpoint = deleteTarget.type === 'folder' 
        ? `${API}/folders/${deleteTarget.id}`
        : `${API}/files/${deleteTarget.id}`;
      
      const res = await fetch(endpoint, { method: 'DELETE', headers });
      
      if (res.ok) {
        toast.success(`${deleteTarget.type === 'folder' ? 'Folder' : 'File'} deleted`);
        setDeleteTarget(null);
        fetchContent();
        onStatsChange?.();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to delete');
      }
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  // Selection functions
  const toggleSelectFile = (fileId) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const selectAllFiles = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedFiles(new Set());
  };

  const deleteSelectedFiles = async () => {
    if (selectedFiles.size === 0) return;
    
    const filesToDelete = Array.from(selectedFiles);
    let deleted = 0;
    
    for (const fileId of filesToDelete) {
      try {
        const res = await fetch(`${API}/files/${fileId}`, { method: 'DELETE', headers });
        if (res.ok) {
          deleted++;
        }
      } catch (e) {
        console.error(`Failed to delete file ${fileId}:`, e);
      }
    }
    
    toast.success(`Deleted ${deleted} file(s)`);
    setShowDeleteSelectedConfirm(false);
    setSelectedFiles(new Set());
    setSelectionMode(false);
    fetchContent();
    onStatsChange?.();
  };

  // Download all files as ZIP - direct link (no blob to avoid memory crash)
  const downloadAllAsZip = () => {
    if (!currentFolderId || files.length === 0) return;
    
    toast.info('Starting ZIP download...');
    
    // Open in new window with token in URL for auth
    const downloadUrl = `${BACKEND_URL}/api/folders/${currentFolderId}/download-zip?token=${token}`;
    window.open(downloadUrl, '_blank');
  };

  // Download selected files as ZIP
  const downloadSelectedAsZip = async () => {
    if (selectedFiles.size === 0) return;
    
    setIsDownloading(true);
    toast.info('Preparing ZIP file...');
    
    try {
      const fileIds = Array.from(selectedFiles);
      
      // For selected files, we need POST so use a form submission approach
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `${BACKEND_URL}/api/files/download-zip?token=${token}`;
      form.target = '_blank';
      
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'file_ids';
      input.value = JSON.stringify(fileIds);
      form.appendChild(input);
      
      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
      
      toast.success('ZIP download started!');
    } catch (e) {
      console.error('ZIP download failed:', e);
      toast.error('Failed to download ZIP');
    } finally {
      setIsDownloading(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!currentFolderId) {
      toast.error('Please select a folder first');
      return;
    }

    setIsUploading(true);
    const progress = {};
    const total = acceptedFiles.length;
    let completed = 0;
    setTotalUploadProgress({ current: 0, total });
    
    for (const file of acceptedFiles) {
      progress[file.name] = 0;
      setUploadProgress({ ...progress });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder_id', currentFolderId);
      
      try {
        // Use XMLHttpRequest for progress tracking
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              progress[file.name] = percent;
              setUploadProgress({ ...progress });
            }
          };
          
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              progress[file.name] = 100;
              setUploadProgress({ ...progress });
              completed++;
              setTotalUploadProgress({ current: completed, total });
              resolve();
            } else {
              try {
                const error = JSON.parse(xhr.responseText);
                toast.error(`Failed to upload ${file.name}: ${error.detail}`);
              } catch {
                toast.error(`Failed to upload ${file.name}`);
              }
              reject();
            }
          };
          
          xhr.onerror = () => {
            toast.error(`Failed to upload ${file.name}`);
            reject();
          };
          
          xhr.open('POST', `${API}/files/upload`);
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.send(formData);
        });
      } catch (e) {
        // Continue with next file
      }
    }
    
    setIsUploading(false);
    setUploadProgress({});
    setTotalUploadProgress({ current: 0, total: 0 });
    toast.success(`Uploaded ${completed}/${total} file(s)`);
    fetchContent();
    onStatsChange?.();
  }, [currentFolderId, token]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'],
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm']
    },
    disabled: !currentFolderId
  });

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {currentFolderId && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateToFolder(path.length > 1 ? path[path.length - 2]?.id : null)}
              className="text-gray-400 hover:text-white"
              data-testid="back-btn"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {currentFolderId ? path[path.length - 1]?.name || 'Gallery' : 'All Galleries'}
            </h1>
            {/* Breadcrumb */}
            {path.length > 0 && (
              <nav className="flex items-center gap-1 text-sm mt-1">
                <button
                  onClick={() => navigateToFolder(null)}
                  className="text-gray-400 hover:text-[#ad946d]"
                  data-testid="breadcrumb-root"
                >
                  Galleries
                </button>
                {path.map((item, index) => (
                  <span key={item.id} className="flex items-center gap-1">
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                    <button
                      onClick={() => navigateToFolder(item.id)}
                      className={index === path.length - 1 ? 'text-white' : 'text-gray-400 hover:text-[#ad946d]'}
                      data-testid={`breadcrumb-${item.id}`}
                    >
                      {item.name}
                    </button>
                  </span>
                ))}
              </nav>
            )}
          </div>
        </div>
        <Button
          onClick={() => setShowNewFolder(true)}
          className="bg-[#ad946d] hover:bg-[#9a8460] text-white"
          data-testid="new-folder-btn"
        >
          <FolderPlus className="w-4 h-4 mr-2" />
          New Folder
        </Button>
      </div>

      {/* Upload Zone (only when inside a folder) */}
      {currentFolderId && (
        <div
          {...getRootProps()}
          className={`dropzone mb-6 ${isDragActive ? 'active' : ''}`}
          data-testid="upload-dropzone"
        >
          <input {...getInputProps()} data-testid="file-input" />
          <Upload className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-300 mb-1">
            {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
          </p>
          <p className="text-gray-500 text-sm">or click to browse</p>
        </div>
      )}

      {/* Upload Progress */}
      {(Object.keys(uploadProgress).length > 0 || isUploading) && (
        <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-4 mb-6" data-testid="upload-progress">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white">
              Uploading... ({totalUploadProgress.current}/{totalUploadProgress.total})
            </h3>
            <span className="text-xs text-gray-400">
              {Math.round((totalUploadProgress.current / totalUploadProgress.total) * 100) || 0}% complete
            </span>
          </div>
          <Progress 
            value={(totalUploadProgress.current / totalUploadProgress.total) * 100 || 0} 
            className="h-2 mb-4" 
          />
          <div className="max-h-32 overflow-y-auto space-y-2">
            {Object.entries(uploadProgress).map(([name, progress]) => (
              <div key={name} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-400 truncate block">{name}</span>
                </div>
                <span className="text-xs text-gray-500 w-12 text-right">{progress}%</span>
                {progress === 100 && <Check className="w-3 h-3 text-green-500" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Folders Grid */}
      {folders.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Folders</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <AnimatePresence>
              {folders.map((folder, index) => (
                <motion.div
                  key={folder.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.03 }}
                  className="group bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-4 hover:border-[#3a3a3a] transition-colors cursor-pointer"
                  onClick={() => navigateToFolder(folder.id)}
                  data-testid={`folder-${folder.id}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <FolderOpen className="w-8 h-8 text-[#ad946d]" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white h-8 w-8"
                          data-testid={`folder-menu-${folder.id}`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[#252525] border-[#333]">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFolder({ id: folder.id, newName: folder.name });
                          }}
                          className="text-gray-300 focus:text-white focus:bg-[#333]"
                          data-testid={`rename-folder-${folder.id}`}
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({ id: folder.id, name: folder.name, type: 'folder' });
                          }}
                          className="text-red-400 focus:text-red-300 focus:bg-[#333]"
                          data-testid={`delete-folder-${folder.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <p className="font-medium text-white truncate mb-1">{folder.name}</p>
                  <p className="text-xs text-gray-500">
                    {folder.file_count} files · {folder.subfolder_count} folders
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {/* Files Grid */}
      {files.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-400">Files ({files.length})</h2>
            <div className="flex items-center gap-2">
              {/* Selection Mode Toggle */}
              {!selectionMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectionMode(true)}
                    className="border-[#333] text-gray-300 hover:bg-[#252525] text-xs"
                    data-testid="select-mode-btn"
                  >
                    <CheckSquare className="w-3 h-3 mr-1" />
                    Select
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadAllAsZip}
                    disabled={isDownloading}
                    className="border-[#333] text-gray-300 hover:bg-[#252525] text-xs"
                    data-testid="download-all-btn"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download All (ZIP)
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllFiles}
                    className="border-[#333] text-gray-300 hover:bg-[#252525] text-xs"
                    data-testid="select-all-btn"
                  >
                    {selectedFiles.size === files.length ? (
                      <>
                        <Square className="w-3 h-3 mr-1" />
                        Deselect All
                      </>
                    ) : (
                      <>
                        <CheckSquare className="w-3 h-3 mr-1" />
                        Select All ({files.length})
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadSelectedAsZip}
                    disabled={selectedFiles.size === 0 || isDownloading}
                    className="border-[#333] text-gray-300 hover:bg-[#252525] text-xs"
                    data-testid="download-selected-btn"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download ZIP ({selectedFiles.size})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteSelectedConfirm(true)}
                    disabled={selectedFiles.size === 0}
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                    data-testid="delete-selected-btn"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete ({selectedFiles.size})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={exitSelectionMode}
                    className="text-gray-400 hover:text-white text-xs"
                    data-testid="exit-select-btn"
                  >
                    <XCircle className="w-3 h-3 mr-1" />
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="file-grid">
            <AnimatePresence>
              {files.map((file, index) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.02 }}
                  className={`group bg-[#1a1a1a] rounded-lg border overflow-hidden transition-colors relative ${
                    selectedFiles.has(file.id) 
                      ? 'border-[#ad946d] ring-2 ring-[#ad946d]/30' 
                      : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
                  } ${selectionMode ? 'cursor-pointer' : ''}`}
                  onClick={() => selectionMode && toggleSelectFile(file.id)}
                  data-testid={`file-${file.id}`}
                >
                  {/* Selection checkbox overlay */}
                  {selectionMode && (
                    <div className="absolute top-2 left-2 z-10">
                      <div 
                        className={`w-6 h-6 rounded flex items-center justify-center ${
                          selectedFiles.has(file.id) 
                            ? 'bg-[#ad946d] text-white' 
                            : 'bg-black/50 text-white border border-white/30'
                        }`}
                      >
                        {selectedFiles.has(file.id) && <Check className="w-4 h-4" />}
                      </div>
                    </div>
                  )}
                  
                  {file.file_type === 'image' ? (
                    <div 
                      className="aspect-square bg-[#252525] relative cursor-pointer"
                      onClick={(e) => {
                        if (!selectionMode) {
                          setPreviewFile(file);
                        }
                      }}
                    >
                      <img
                        src={`${BACKEND_URL}${file.thumbnail_url}`}
                        alt={file.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.parentElement.classList.add('flex', 'items-center', 'justify-center');
                          e.target.parentElement.innerHTML = '<span class="text-gray-500">Loading...</span>';
                        }}
                      />
                      {!selectionMode && (
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }}
                            className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-full backdrop-blur-sm"
                            data-testid={`preview-${file.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <a
                            href={`${BACKEND_URL}/api/files/${file.id}/download`}
                            download
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#ad946d]/80 hover:bg-[#ad946d] text-white p-2 rounded-full backdrop-blur-sm"
                            data-testid={`download-${file.id}`}
                          >
                            <Download className="w-4 h-4" />
                          </a>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: file.id, name: file.name, type: 'file' }); }}
                            className="bg-red-500/50 hover:bg-red-500/70 text-white p-2 rounded-full backdrop-blur-sm"
                            data-testid={`delete-file-${file.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : file.file_type === 'video' ? (
                    <div className="aspect-square bg-[#252525] flex items-center justify-center relative">
                      <Film className="w-12 h-12 text-gray-500" />
                      {!selectionMode && (
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <a
                            href={`${BACKEND_URL}/api/files/${file.id}/download`}
                            download
                            className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-full backdrop-blur-sm"
                          >
                            <FileIcon className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => setDeleteTarget({ id: file.id, name: file.name, type: 'file' })}
                            className="bg-red-500/50 hover:bg-red-500/70 text-white p-2 rounded-full backdrop-blur-sm"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="aspect-square bg-[#252525] flex items-center justify-center">
                      <FileIcon className="w-12 h-12 text-gray-500" />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-sm text-white truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {/* Empty State */}
      {!loading && folders.length === 0 && files.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-[#252525] flex items-center justify-center mx-auto mb-4">
            <FolderOpen className="w-8 h-8 text-gray-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">
            {currentFolderId ? 'This folder is empty' : 'No galleries yet'}
          </h3>
          <p className="text-gray-500 mb-4">
            {currentFolderId 
              ? 'Upload files or create subfolders'
              : 'Create your first gallery to get started'
            }
          </p>
          <Button
            onClick={() => setShowNewFolder(true)}
            className="bg-[#ad946d] hover:bg-[#9a8460] text-white"
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            Create Folder
          </Button>
        </div>
      )}

      {/* New Folder Dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent className="bg-[#1a1a1a] border-[#2a2a2a] text-white">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="folderName" className="text-gray-300">Folder Name</Label>
            <Input
              id="folderName"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g., Sarah & John - 301024"
              className="mt-2 bg-[#252525] border-[#333] text-white"
              data-testid="new-folder-name-input"
              onKeyDown={(e) => e.key === 'Enter' && createFolder()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewFolder(false)} className="text-gray-400">
              Cancel
            </Button>
            <Button
              onClick={createFolder}
              className="bg-[#ad946d] hover:bg-[#9a8460] text-white"
              data-testid="create-folder-btn"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={!!editingFolder} onOpenChange={() => setEditingFolder(null)}>
        <DialogContent className="bg-[#1a1a1a] border-[#2a2a2a] text-white">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="editFolderName" className="text-gray-300">New Name</Label>
            <Input
              id="editFolderName"
              value={editingFolder?.newName || ''}
              onChange={(e) => setEditingFolder({ ...editingFolder, newName: e.target.value })}
              className="mt-2 bg-[#252525] border-[#333] text-white"
              data-testid="rename-folder-input"
              onKeyDown={(e) => e.key === 'Enter' && updateFolder()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingFolder(null)} className="text-gray-400">
              Cancel
            </Button>
            <Button
              onClick={updateFolder}
              className="bg-[#ad946d] hover:bg-[#9a8460] text-white"
              data-testid="save-rename-btn"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="bg-[#1a1a1a] border-[#2a2a2a]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete {deleteTarget?.type}?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;?
              {deleteTarget?.type === 'folder' && ' All files and subfolders will be permanently deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[#333] text-gray-300 hover:bg-[#252525] hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteItem}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="confirm-delete-btn"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Selected Confirmation */}
      <AlertDialog open={showDeleteSelectedConfirm} onOpenChange={setShowDeleteSelectedConfirm}>
        <AlertDialogContent className="bg-[#1a1a1a] border-[#2a2a2a]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete {selectedFiles.size} files?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to delete {selectedFiles.size} selected file(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[#333] text-gray-300 hover:bg-[#252525] hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteSelectedFiles}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="confirm-delete-selected-btn"
            >
              Delete {selectedFiles.size} Files
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
            onClick={() => setPreviewFile(null)}
          >
            <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
              <img
                src={`${BACKEND_URL}${previewFile.preview_url || previewFile.thumbnail_url}`}
                alt={previewFile.name}
                className="max-w-full max-h-[85vh] object-contain rounded"
              />
              <div className="absolute top-4 right-4 flex gap-2">
                <a
                  href={`${BACKEND_URL}/api/files/${previewFile.id}/download`}
                  download
                  className="bg-[#ad946d] hover:bg-[#9a8460] text-white p-3 rounded-full"
                  data-testid="preview-download-btn"
                >
                  <Download className="w-5 h-5" />
                </a>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="bg-white/20 hover:bg-white/30 text-white p-3 rounded-full backdrop-blur-sm"
                  data-testid="preview-close-btn"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm">
                {previewFile.name}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
