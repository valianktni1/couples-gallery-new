import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  FolderOpen, Share2, LayoutDashboard, LogOut,
  ChevronRight, Plus, Upload, Settings, Users, Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

// Admin components
import DashboardHome from '@/components/admin/DashboardHome';
import FolderManager from '@/components/admin/FolderManager';
import ShareManager from '@/components/admin/ShareManager';
import { ActivityLogs } from '@/components/admin/ActivityLogs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const LOGO_URL = "https://customer-assets.emergentagent.com/job_6e5757e7-0b45-46c5-8f03-c1858510b49f/artifacts/fq31etoy_cropped-new-logo-2022-black-with-bevel-1.png";

export default function AdminDashboard() {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
    toast.success('Logged out successfully');
  };

  const navItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { path: '/admin/folders', icon: FolderOpen, label: 'Galleries' },
    { path: '/admin/shares', icon: Share2, label: 'Share Links' },
    { path: '/admin/activity', icon: Activity, label: 'Activity Logs' },
  ];

  const isActive = (path, exact = false) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-[#121212] flex admin-theme dark">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1a1a1a] border-r border-[#2a2a2a] flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-[#2a2a2a]">
          <img 
            src={LOGO_URL} 
            alt="Weddings By Mark" 
            className="h-12 invert brightness-200"
          />
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.path}
              data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                isActive(item.path, item.exact)
                  ? 'bg-[#ad946d]/20 text-[#ad946d]'
                  : 'text-gray-400 hover:text-white hover:bg-[#252525]'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-[#2a2a2a]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#ad946d]/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-[#ad946d]" />
              </div>
              <span className="text-sm text-gray-300">{user?.username}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              data-testid="logout-btn"
              onClick={handleLogout}
              className="text-gray-400 hover:text-white hover:bg-[#252525]"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route index element={<DashboardHome stats={stats} onRefresh={fetchStats} />} />
          <Route path="folders/*" element={<FolderManager onStatsChange={fetchStats} />} />
          <Route path="shares" element={<ShareManager />} />
          <Route path="activity" element={<ActivityLogs />} />
        </Routes>
      </main>
    </div>
  );
}
