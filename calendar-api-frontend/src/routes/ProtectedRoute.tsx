import React, { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";

const ProtectedRoute: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("api/auth-check", {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error("Authentication check failed", error);
        setIsAuthenticated(false);
      } finally {
        setAuthChecked(true);
      }
    };

    checkAuth();
  }, []);

  if (!authChecked) {
    return null; // or a loading spinner
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
