import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Lock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const LOGO_URL = "https://customer-assets.emergentagent.com/job_6e5757e7-0b45-46c5-8f03-c1858510b49f/artifacts/fq31etoy_cropped-new-logo-2022-black-with-bevel-1.png";

export default function SetupPage({ onComplete }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${API}/setup/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Setup failed');
      }
      
      const data = await res.json();
      localStorage.setItem('admin_token', data.token);
      toast.success('Admin account created successfully!');
      onComplete();
      window.location.href = '/admin';
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <img 
            src={LOGO_URL} 
            alt="Weddings By Mark" 
            className="h-20 mx-auto mb-4 invert brightness-200"
          />
          <p className="text-gray-400">Gallery Setup</p>
        </div>

        {/* Setup Card */}
        <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-8">
          <h2 className="text-xl font-semibold text-white mb-2">Create Admin Account</h2>
          <p className="text-gray-400 text-sm mb-6">
            Set up your administrator credentials to manage your galleries.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-300">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  id="username"
                  data-testid="setup-username-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="pl-10 bg-[#252525] border-[#333] text-white placeholder:text-gray-500 focus:border-[#ad946d]"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  id="password"
                  type="password"
                  data-testid="setup-password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create password"
                  className="pl-10 bg-[#252525] border-[#333] text-white placeholder:text-gray-500 focus:border-[#ad946d]"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-gray-300">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  id="confirmPassword"
                  type="password"
                  data-testid="setup-confirm-password-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="pl-10 bg-[#252525] border-[#333] text-white placeholder:text-gray-500 focus:border-[#ad946d]"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              data-testid="setup-submit-btn"
              disabled={loading}
              className="w-full bg-[#ad946d] hover:bg-[#9a8460] text-white font-medium py-5"
            >
              {loading ? 'Creating Account...' : 'Create Admin Account'}
            </Button>
          </form>
        </div>

        <p className="text-center text-gray-500 text-sm mt-6">
          Couples Gallery Management System
        </p>
      </div>
    </div>
  );
}
