import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import "./index.css";
import Login from "./pages/Login/Login.tsx";
import Home from "./pages/Home/Home.tsx";
import PrivacyPolicy from "./pages/PrivacyPolicy/PrivacyPolicy.tsx";
import Schedule from "./pages/Schedule/Schedule.tsx";
import NotFound from "./NotFound.tsx";
import ProtectedRoute from "./routes/ProtectedRoute.tsx";
import Settings from "./pages/Settings/Settings.tsx";
import { Toaster } from "./components/ui/sonner.tsx";
import RootLayout from "./layouts/root-layout.tsx";
import TermsOfService from "./pages/TermsOfService/TermsOfService.tsx";
import SlingSchedule from "./components/SlingSchedule/SlingSchedule.tsx";

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
        path: "/app",
        children: [
          { path: "/app/sling-schedule", element: <SlingSchedule /> },
          { path: "/app/schedule", element: <Schedule /> },
          { path: "/app/settings", element: <Settings /> },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="flex min-h-screen w-full flex-col font-sf">
      <RouterProvider router={router} />
    </div>
    <Toaster visibleToasts={6} />
  </React.StrictMode>
);
