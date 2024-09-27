import {
  Route,
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
} from "react-router-dom";
import Login from "./pages/Login/Login.tsx";
import Signup from "./pages/Signup/Signup.tsx";
import Home from "./pages/Home/Home.tsx";
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
      <Route path="" element={<ProtectedRoute />}>
        <Route path="home" element={<Home />} />
        <Route path="settings" element={<Settings />} />
        <Route path="calendars" element={<Calendar />} />
      </Route>
      <Route path="login" element={<Login />} />
      <Route path="signup" element={<Signup />} />
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
