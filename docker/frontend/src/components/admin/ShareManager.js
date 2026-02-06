import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  Share2, Plus, Trash2, Copy, QrCode, ExternalLink,
  Eye, Edit2, Lock, FolderOpen, Check
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const SHARE_DOMAIN = 'https://weddingsbymark.uk';

export default function ShareManager() {
  const { token } = useAuth();
  const [shares, setShares] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Dialogs
  const [showNewShare, setShowNewShare] = useState(false);
  const [showQRCode, setShowQRCode] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editingShare, setEditingShare] = useState(null);
  
  // New share form
  const [newShare, setNewShare] = useState({
    folder_id: '',
    token: '',
    permission: 'read'
  });

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchShares();
    fetchFolders();
  }, []);

  const fetchShares = async () => {
    try {
      const res = await fetch(`${API}/shares`, { headers });
      if (res.ok) {
        setShares(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch shares:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchFolders = async () => {
    try {
      // Fetch ALL folders (including subfolders) for selection
      const res = await fetch(`${API}/folders/all`, { headers });
      if (res.ok) {
        setFolders(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch folders:', e);
    }
  };

  const createShare = async () => {
    if (!newShare.folder_id || !newShare.token.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    // Clean the token (remove spaces, special chars)
    const cleanToken = newShare.token.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    try {
      const res = await fetch(`${API}/shares`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_id: newShare.folder_id,
          token: cleanToken,
          permission: newShare.permission
        })
      });

      if (res.ok) {
        toast.success('Share link created');
        setShowNewShare(false);
        setNewShare({ folder_id: '', token: '', permission: 'read' });
        fetchShares();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to create share');
      }
    } catch (e) {
      toast.error('Failed to create share');
    }
  };

  const updateShare = async () => {
    if (!editingShare) return;

    try {
      const res = await fetch(`${API}/shares/${editingShare.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission: editingShare.permission })
      });

      if (res.ok) {
        toast.success('Share updated');
        setEditingShare(null);
        fetchShares();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to update share');
      }
    } catch (e) {
      toast.error('Failed to update share');
    }
  };

  const deleteShare = async () => {
    if (!deleteTarget) return;

    try {
      const res = await fetch(`${API}/shares/${deleteTarget.id}`, {
        method: 'DELETE',
        headers
      });

      if (res.ok) {
        toast.success('Share deleted');
        setDeleteTarget(null);
        fetchShares();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to delete share');
      }
    } catch (e) {
      toast.error('Failed to delete share');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getPermissionBadge = (permission) => {
    const styles = {
      read: 'bg-blue-500/20 text-blue-400',
      edit: 'bg-green-500/20 text-green-400',
      full: 'bg-amber-500/20 text-amber-400'
    };
    const labels = {
      read: 'Read Only',
      edit: 'Can Edit',
      full: 'Full Access'
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[permission]}`}>
        {labels[permission]}
      </span>
    );
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Share Links</h1>
          <p className="text-gray-400">Create and manage gallery share links for your couples</p>
        </div>
        <Button
          onClick={() => setShowNewShare(true)}
          className="bg-[#ad946d] hover:bg-[#9a8460] text-white"
          data-testid="new-share-btn"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Share Link
        </Button>
      </div>

      {/* Shares List */}
      {shares.length > 0 ? (
        <div className="space-y-4">
          <AnimatePresence>
            {shares.map((share, index) => (
              <motion.div
                key={share.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.05 }}
                className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-5 hover:border-[#3a3a3a] transition-colors"
                data-testid={`share-${share.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-[#ad946d]/20 flex items-center justify-center">
                      <FolderOpen className="w-6 h-6 text-[#ad946d]" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white mb-1">{share.folder_name}</h3>
                      <div className="flex items-center gap-2 mb-2">
                        <code className="text-sm text-[#ad946d] bg-[#252525] px-2 py-1 rounded">
                          {share.share_url}
                        </code>
                        <button
                          onClick={() => copyToClipboard(share.share_url)}
                          className="text-gray-400 hover:text-white p-1"
                          data-testid={`copy-${share.id}`}
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        {getPermissionBadge(share.permission)}
                        <span className="text-xs text-gray-500">
                          Created {new Date(share.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowQRCode(share)}
                      className="text-gray-400 hover:text-white"
                      data-testid={`qr-${share.id}`}
                    >
                      <QrCode className="w-5 h-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(`/${share.token}`, '_blank')}
                      className="text-gray-400 hover:text-white"
                      data-testid={`preview-${share.id}`}
                    >
                      <ExternalLink className="w-5 h-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingShare({ ...share })}
                      className="text-gray-400 hover:text-white"
                      data-testid={`edit-${share.id}`}
                    >
                      <Edit2 className="w-5 h-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(share)}
                      className="text-gray-400 hover:text-red-400"
                      data-testid={`delete-${share.id}`}
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : !loading ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-[#252525] flex items-center justify-center mx-auto mb-4">
            <Share2 className="w-8 h-8 text-gray-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No share links yet</h3>
          <p className="text-gray-500 mb-4">Create your first share link to let couples access their gallery</p>
          <Button
            onClick={() => setShowNewShare(true)}
            className="bg-[#ad946d] hover:bg-[#9a8460] text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Share Link
          </Button>
        </div>
      ) : null}

      {/* New Share Dialog */}
      <Dialog open={showNewShare} onOpenChange={setShowNewShare}>
        <DialogContent className="bg-[#1a1a1a] border-[#2a2a2a] text-white">
          <DialogHeader>
            <DialogTitle>Create Share Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-gray-300">Select Gallery</Label>
              <Select
                value={newShare.folder_id}
                onValueChange={(value) => setNewShare({ ...newShare, folder_id: value })}
              >
                <SelectTrigger className="mt-2 bg-[#252525] border-[#333] text-white" data-testid="folder-select">
                  <SelectValue placeholder="Choose a gallery..." />
                </SelectTrigger>
                <SelectContent className="bg-[#252525] border-[#333]">
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id} className="text-white focus:bg-[#333]">
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-300">Share Token</Label>
              <Input
                value={newShare.token}
                onChange={(e) => setNewShare({ ...newShare, token: e.target.value })}
                placeholder="e.g., sarahjohn301024"
                className="mt-2 bg-[#252525] border-[#333] text-white"
                data-testid="share-token-input"
              />
              <p className="text-xs text-gray-500 mt-1">
                This will create: {SHARE_DOMAIN}/{newShare.token.toLowerCase().replace(/[^a-z0-9]/g, '') || 'yourtoken'}
              </p>
            </div>

            <div>
              <Label className="text-gray-300">Permission Level</Label>
              <Select
                value={newShare.permission}
                onValueChange={(value) => setNewShare({ ...newShare, permission: value })}
              >
                <SelectTrigger className="mt-2 bg-[#252525] border-[#333] text-white" data-testid="permission-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#252525] border-[#333]">
                  <SelectItem value="read" className="text-white focus:bg-[#333]">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      Read Only - View and download
                    </div>
                  </SelectItem>
                  <SelectItem value="edit" className="text-white focus:bg-[#333]">
                    <div className="flex items-center gap-2">
                      <Edit2 className="w-4 h-4" />
                      Can Edit - View, download, add to favourites
                    </div>
                  </SelectItem>
                  <SelectItem value="full" className="text-white focus:bg-[#333]">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Full Access - All permissions
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewShare(false)} className="text-gray-400">
              Cancel
            </Button>
            <Button
              onClick={createShare}
              className="bg-[#ad946d] hover:bg-[#9a8460] text-white"
              data-testid="create-share-btn"
            >
              Create Share Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={!!showQRCode} onOpenChange={() => setShowQRCode(null)}>
        <DialogContent className="bg-[#1a1a1a] border-[#2a2a2a] text-white">
          <DialogHeader>
            <DialogTitle>QR Code for {showQRCode?.folder_name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-6">
            <div className="qr-container mb-4">
              <QRCodeSVG
                value={showQRCode?.share_url || ''}
                size={200}
                fgColor="#121212"
                bgColor="#ffffff"
                data-testid="qr-code-svg"
              />
            </div>
            <code className="text-sm text-[#ad946d] bg-[#252525] px-3 py-2 rounded mb-4">
              {showQRCode?.share_url}
            </code>
            <div className="flex gap-2">
              <Button
                onClick={() => copyToClipboard(showQRCode?.share_url)}
                variant="outline"
                className="border-[#333] text-gray-300 hover:bg-[#252525]"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Link
              </Button>
              <Button
                onClick={() => {
                  const svg = document.querySelector('[data-testid="qr-code-svg"]');
                  if (svg) {
                    const svgData = new XMLSerializer().serializeToString(svg);
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const img = new Image();
                    img.onload = () => {
                      canvas.width = img.width;
                      canvas.height = img.height;
                      ctx.fillStyle = 'white';
                      ctx.fillRect(0, 0, canvas.width, canvas.height);
                      ctx.drawImage(img, 0, 0);
                      const pngUrl = canvas.toDataURL('image/png');
                      const link = document.createElement('a');
                      link.download = `qr-${showQRCode?.token}.png`;
                      link.href = pngUrl;
                      link.click();
                    };
                    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
                  }
                }}
                className="bg-[#ad946d] hover:bg-[#9a8460] text-white"
                data-testid="download-qr-btn"
              >
                Download QR
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Share Dialog */}
      <Dialog open={!!editingShare} onOpenChange={() => setEditingShare(null)}>
        <DialogContent className="bg-[#1a1a1a] border-[#2a2a2a] text-white">
          <DialogHeader>
            <DialogTitle>Edit Share Link</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-gray-300">Permission Level</Label>
            <Select
              value={editingShare?.permission}
              onValueChange={(value) => setEditingShare({ ...editingShare, permission: value })}
            >
              <SelectTrigger className="mt-2 bg-[#252525] border-[#333] text-white" data-testid="edit-permission-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#252525] border-[#333]">
                <SelectItem value="read" className="text-white focus:bg-[#333]">Read Only</SelectItem>
                <SelectItem value="edit" className="text-white focus:bg-[#333]">Can Edit</SelectItem>
                <SelectItem value="full" className="text-white focus:bg-[#333]">Full Access</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingShare(null)} className="text-gray-400">
              Cancel
            </Button>
            <Button
              onClick={updateShare}
              className="bg-[#ad946d] hover:bg-[#9a8460] text-white"
              data-testid="save-share-btn"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="bg-[#1a1a1a] border-[#2a2a2a]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete share link?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This will revoke access for anyone using this link. The gallery and its files will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[#333] text-gray-300 hover:bg-[#252525] hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteShare}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="confirm-delete-share-btn"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
