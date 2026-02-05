import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FolderOpen, Image, Share2, HardDrive,
  ArrowUpRight, Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function DashboardHome({ stats, onRefresh }) {
  const navigate = useNavigate();

  const statCards = [
    {
      label: 'Total Galleries',
      value: stats?.folder_count || 0,
      icon: FolderOpen,
      color: 'bg-blue-500/20 text-blue-400',
      path: '/admin/folders'
    },
    {
      label: 'Total Files',
      value: stats?.file_count || 0,
      icon: Image,
      color: 'bg-green-500/20 text-green-400',
      path: '/admin/folders'
    },
    {
      label: 'Active Shares',
      value: stats?.share_count || 0,
      icon: Share2,
      color: 'bg-purple-500/20 text-purple-400',
      path: '/admin/shares'
    },
    {
      label: 'Storage Used',
      value: formatBytes(stats?.total_size || 0),
      icon: HardDrive,
      color: 'bg-amber-500/20 text-amber-400',
      path: null
    }
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Dashboard</h1>
          <p className="text-gray-400">Manage your couple galleries and share links</p>
        </div>
        <div className="flex gap-3">
          <Button
            data-testid="quick-add-gallery-btn"
            onClick={() => navigate('/admin/folders')}
            className="bg-[#ad946d] hover:bg-[#9a8460] text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Gallery
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-6 hover:border-[#3a3a3a] transition-colors cursor-pointer group"
            onClick={() => stat.path && navigate(stat.path)}
            data-testid={`stat-${stat.label.toLowerCase().replace(' ', '-')}`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center`}>
                <stat.icon className="w-5 h-5" />
              </div>
              {stat.path && (
                <ArrowUpRight className="w-5 h-5 text-gray-500 group-hover:text-[#ad946d] transition-colors" />
              )}
            </div>
            <p className="text-gray-400 text-sm mb-1">{stat.label}</p>
            <p className="text-2xl font-semibold text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => navigate('/admin/folders')}
            data-testid="quick-action-manage-galleries"
            className="flex items-center gap-4 p-4 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] transition-colors text-left"
          >
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <FolderOpen className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="font-medium text-white">Manage Galleries</p>
              <p className="text-sm text-gray-400">Create and organize couple folders</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/admin/shares')}
            data-testid="quick-action-share-links"
            className="flex items-center gap-4 p-4 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] transition-colors text-left"
          >
            <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Share2 className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="font-medium text-white">Share Links</p>
              <p className="text-sm text-gray-400">Create and manage share links</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/admin/folders')}
            data-testid="quick-action-upload"
            className="flex items-center gap-4 p-4 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] transition-colors text-left"
          >
            <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Image className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="font-medium text-white">Upload Files</p>
              <p className="text-sm text-gray-400">Add photos and videos</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
