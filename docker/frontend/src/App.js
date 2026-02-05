import { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

// Pages
import SetupPage from "@/pages/SetupPage";
import LoginPage from "@/pages/LoginPage";
import AdminDashboard from "@/pages/AdminDashboard";
import GalleryPage from "@/pages/GalleryPage";

// Context
import { AuthProvider, useAuth } from "@/context/AuthContext";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }
  
  return children;
};

function AppRoutes() {
  const [setupComplete, setSetupComplete] = useState(null);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    checkSetup();
  }, []);

  const checkSetup = async () => {
    try {
      const res = await fetch(`${API}/setup/status`);
      const data = await res.json();
      setSetupComplete(data.setup_complete);
    } catch (e) {
      console.error("Setup check failed:", e);
      setSetupComplete(false);
    }
  };

  if (setupComplete === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Setup route - only if not complete */}
      <Route 
        path="/admin/setup" 
        element={
          setupComplete ? 
            <Navigate to="/admin" replace /> : 
            <SetupPage onComplete={() => setSetupComplete(true)} />
        } 
      />
      
      {/* Login route */}
      <Route 
        path="/admin/login" 
        element={
          !setupComplete ? 
            <Navigate to="/admin/setup" replace /> :
            isAuthenticated ?
              <Navigate to="/admin" replace /> :
              <LoginPage />
        } 
      />
      
      {/* Admin dashboard */}
      <Route 
        path="/admin/*" 
        element={
          !setupComplete ? 
            <Navigate to="/admin/setup" replace /> :
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
        } 
      />
      
      {/* Public gallery with share token */}
      <Route path="/:token" element={<GalleryPage />} />
      
      {/* Root redirect */}
      <Route 
        path="/" 
        element={
          !setupComplete ? 
            <Navigate to="/admin/setup" replace /> :
            <Navigate to="/admin" replace />
        } 
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster 
          position="bottom-right" 
          richColors 
          closeButton
          toastOptions={{
            style: {
              fontFamily: 'Manrope, sans-serif'
            }
          }}
        />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
