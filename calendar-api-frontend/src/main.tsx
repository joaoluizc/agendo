import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import "./index.css";
import Login from "./pages/Login/Login.tsx";
import Home from "./pages/Home/Home.tsx";
import PrivacyPolicy from "./pages/PrivacyPolicy/PrivacyPolicy.tsx";
import Dashboard from "./pages/Dashboard/Dashboard.tsx";
import NotFound from "./NotFound.tsx";
import ProtectedRoute from "./routes/ProtectedRoute.tsx";
import Settings from "./pages/Settings/Settings.tsx";
import { Providers } from "./providers/Providers.tsx";
import { Toaster } from "./components/ui/sonner.tsx";
import RootLayout from "./layouts/root-layout.tsx";
import TermsOfService from "./pages/TermsOfService/TermsOfService.tsx";

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/login", element: <Login /> },
      { path: "/privacy", element: <PrivacyPolicy /> },
      { path: "/terms", element: <TermsOfService /> },
      { path: "*", element: <NotFound /> },
      {
        element: <ProtectedRoute />,
        path: "/dashboard",
        children: [
          { path: "/dashboard", element: <Dashboard /> },
          { path: "/dashboard/settings", element: <Settings /> },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Providers>
      <div className="flex min-h-screen w-full flex-col font-sf">
        <RouterProvider router={router} />
      </div>
      <Toaster />
    </Providers>
  </React.StrictMode>
);
