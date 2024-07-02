import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const ProtectedRoute: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  
  useEffect(() => {
    const checkAuth = async () => {
      const response = await fetch('api/auth-check', {
        method: 'GET',
        mode: 'cors',
        credentials: 'include',
      });
      if (!response.ok) {
        console.error('Not authenticated');
        setIsAuthenticated(false);
      }
      setAuthChecked(true);
      console.log('Authenticated');
      setIsAuthenticated(true);
    };
    checkAuth();
  }, []);

  if (!authChecked) {
    return null; // or a loading spinner
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" />;
  // return <Outlet />
};

export default ProtectedRoute;
