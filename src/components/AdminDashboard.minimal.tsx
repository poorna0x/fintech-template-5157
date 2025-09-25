import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AdminHeader from '@/components/AdminHeader';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simple loading simulation
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      
      <main className="container mx-auto px-4 py-4 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Admin Dashboard (Minimal Test)
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Testing basic component functionality
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Component Status</h2>
          <p className="text-green-600">✅ Component is rendering successfully!</p>
          <p className="text-gray-600 mt-2">User: {user?.fullName || 'Not logged in'}</p>
          <p className="text-gray-600">Is Admin: {isAdmin ? 'Yes' : 'No'}</p>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
