import React from 'react';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const token = localStorage.getItem('admin_token');
  
  console.log('🔒 ProtectedRoute check:', {
    hasToken: !!token,
    tokenLength: token?.length || 0,
    tokenPreview: token ? `${token.substring(0, 20)}...` : 'none',
    currentPath: window.location.pathname
  });

  if (!token) {
    console.log('🔒 No token found, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  console.log('🔒 Token found, allowing access');
  return <>{children}</>;
};

