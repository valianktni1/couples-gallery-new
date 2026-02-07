import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { 
  Activity, Eye, Download, Upload, Archive, Trash2, RefreshCw,
  ChevronLeft, ChevronRight, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

const ACTION_ICONS = {
  'gallery_view': Eye,
  'file_download': Download,
  'zip_download': Archive,
  'file_upload': Upload
};

const ACTION_LABELS = {
  'gallery_view': 'Viewed Gallery',
  'file_download': 'Downloaded File',
  'zip_download': 'Downloaded ZIP',
  'file_upload': 'Uploaded File'
};

const ACTION_COLORS = {
  'gallery_view': 'text-blue-400',
  'file_download': 'text-green-400',
  'zip_download': 'text-purple-400',
  'file_upload': 'text-yellow-400'
};

export function ActivityLogs() {
  const { token } = useAuth();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const limit = 20;
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchLogs();
  }, [page, searchTerm]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        skip: (page * limit).toString()
      });
      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim());
      }
      
      const res = await fetch(`${API}/activity-logs?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
      }
    } catch (e) {
      toast.error('Failed to fetch activity logs');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value) => {
    setSearchTerm(value);
    setPage(0); // Reset to first page when searching
  };
    try {
      const res = await fetch(`${API}/activity-logs`, { method: 'DELETE', headers });
      if (res.ok) {
        toast.success('Activity logs cleared');
        setLogs([]);
        setTotal(0);
        setPage(0);
      }
    } catch (e) {
      toast.error('Failed to clear logs');
    }
    setShowClearConfirm(false);
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white flex items-center gap-3">
            <Activity className="w-7 h-7 text-[#ad946d]" />
            Activity Logs
          </h1>
          <p className="text-gray-400 mt-1">Track client gallery views, downloads and uploads</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={fetchLogs}
            className="border-[#333] text-gray-300 hover:bg-[#252525]"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          {logs.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowClearConfirm(true)}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {Object.entries(ACTION_LABELS).map(([action, label]) => {
          const count = logs.filter(l => l.action === action).length;
          const Icon = ACTION_ICONS[action];
          return (
            <div key={action} className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-5 h-5 ${ACTION_COLORS[action]}`} />
                <span className="text-gray-400 text-sm">{label}</span>
              </div>
              <p className="text-2xl font-semibold text-white">{count}</p>
            </div>
          );
        })}
      </div>

      {/* Logs Table */}
      <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center">
            <Activity className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No activity recorded yet</p>
            <p className="text-gray-500 text-sm mt-1">Client views and downloads will appear here</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-[#252525] border-b border-[#333]">
                <tr>
                  <th className="text-left p-4 text-gray-400 font-medium text-sm">Action</th>
                  <th className="text-left p-4 text-gray-400 font-medium text-sm">Gallery/Folder</th>
                  <th className="text-left p-4 text-gray-400 font-medium text-sm">File</th>
                  <th className="text-left p-4 text-gray-400 font-medium text-sm">IP Address</th>
                  <th className="text-left p-4 text-gray-400 font-medium text-sm">Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, index) => {
                  const Icon = ACTION_ICONS[log.action] || Activity;
                  return (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="border-b border-[#2a2a2a] hover:bg-[#252525]"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${ACTION_COLORS[log.action]}`} />
                          <span className="text-white text-sm">{ACTION_LABELS[log.action]}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-gray-300 text-sm">{log.folder_name || '-'}</span>
                        {log.share_token && (
                          <span className="text-gray-500 text-xs ml-2">({log.share_token})</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="text-gray-300 text-sm truncate max-w-[200px] block">
                          {log.file_name || (log.details?.file_count ? `${log.details.file_count} files` : '-')}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-gray-400 text-sm font-mono">{log.ip_address || '-'}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-gray-400 text-sm">{formatDate(log.created_at)}</span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-[#333]">
                <span className="text-gray-400 text-sm">
                  Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p - 1)}
                    disabled={page === 0}
                    className="border-[#333] text-gray-300"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= totalPages - 1}
                    className="border-[#333] text-gray-300"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Clear Confirmation */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent className="bg-[#1a1a1a] border-[#2a2a2a]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Clear all activity logs?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This will permanently delete all activity logs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[#333] text-gray-300 hover:bg-[#252525] hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={clearLogs}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Clear All Logs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
