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
import RequirePermission from "./permissions/RequirePermission.tsx";
import Settings from "./pages/Settings/Settings.tsx";
import SettingsLayout from "./pages/Settings/SettingsLayout.tsx";
import { Toaster } from "./components/ui/sonner.tsx";
import RootLayout from "./layouts/root-layout.tsx";
import TermsOfService from "./pages/TermsOfService/TermsOfService.tsx";
import AdaChat from "./pages/AdaChat/AdaChat.tsx";
import SlingSchedule from "./components/SlingSchedule/SlingSchedule.tsx";
import AdaStats from "./pages/AdaStats/AdaStats.tsx";
// Jira backlog — self-contained feature, see pages/JiraBacklog/README.md to remove.
import JiraBacklog from "./pages/JiraBacklog/JiraBacklog.tsx";
import Tasks from "./pages/Tasks/Tasks.tsx";
import Reports from "./pages/Reports/Reports.tsx";
// Performance — self-contained feature, see pages/Performance/README.md to remove.
import Performance from "./pages/Performance/Performance.tsx";
import Users from "./pages/Settings/Users/Users.tsx";

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/ada", element: <AdaChat /> },
      { path: "/login", element: <Login /> },
      { path: "/privacy", element: <PrivacyPolicy /> },
      { path: "/terms", element: <TermsOfService /> },
      { path: "/ada-stats", element: <AdaStats /> },
      { path: "*", element: <NotFound /> },
      {
        element: <ProtectedRoute />,
        path: "/app",
        // Each area's pages need its level (see permissions/pages.ts for the nav). The API
        // checks the same thing on every call; these guards just spare people a page of 403s.
        children: [
          {
            element: <RequirePermission requires="scheduling:view" />,
            children: [
              { path: "/app/sling-schedule", element: <SlingSchedule /> },
              { path: "/app/schedule", element: <Schedule /> },
            ],
          },
          {
            element: <RequirePermission requires="bugs:view" />,
            children: [
              { path: "/app/jira-backlog", element: <JiraBacklog /> },
              { path: "/app/tasks", element: <Tasks /> },
            ],
          },
          {
            // Everyone sees their own report by default; reports:edit sees everyone's.
            element: <RequirePermission requires="reports:self" />,
            children: [{ path: "/app/reports", element: <Reports /> }],
          },
          {
            element: <RequirePermission requires="performance:edit" />,
            children: [{ path: "/app/performance", element: <Performance /> }],
          },
          // Every settings page shares SettingsLayout's sidebar. Users (access and notes) is
          // admin-only.
          {
            path: "/app/settings",
            element: <SettingsLayout />,
            children: [
              { index: true, element: <Settings /> },
              {
                element: <RequirePermission requires="admin" />,
                children: [{ path: "/app/settings/users", element: <Users /> }],
              },
            ],
          },
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
    <Toaster visibleToasts={6} richColors />
  </React.StrictMode>,
);
