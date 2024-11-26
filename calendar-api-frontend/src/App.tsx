import {
  Route,
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
} from "react-router-dom";
import Login from "./pages/Login/Login.tsx";
import Home from "./pages/Home/Home.tsx";
import PrivacyPolicy from "./pages/PrivacyPolicy/PrivacyPolicy.tsx";
import Dashboard from "./pages/Dashboard/Dashboard.tsx";
import NotFound from "./NotFound.tsx";
import ProtectedRoute from "./routes/ProtectedRoute.tsx";
import Header from "./components/Header/Header.tsx";
import Settings from "./pages/Settings/Settings.tsx";
import Calendar from "./pages/Calendar/Calendar.tsx";
import "./App.css";
import { Providers } from "./providers/Providers.tsx";
import { Toaster } from "./components/ui/sonner.tsx";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<Header />}>
      <Route path="app" element={<ProtectedRoute />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="settings" element={<Settings />} />
        <Route path="calendars" element={<Calendar />} />
      </Route>
      <Route path="" element={<Home />} />
      <Route path="login" element={<Login />} />
      <Route path="privacy" element={<PrivacyPolicy />} />
      <Route path="*" element={<NotFound />} />
    </Route>
  )
);

function App() {
  return (
    <Providers>
      <div className="flex min-h-screen w-full flex-col font-sf">
        <RouterProvider router={router} />
      </div>
      <Toaster />
    </Providers>
  );
}

export default App;
