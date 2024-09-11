import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Login from './pages/Login/Login';
import Signup from './pages/Signup/Signup';
import Home from './pages/Home/Home';
import NotFound from './NotFound';
import ProtectedRoute from './routes/ProtectedRoute';
import Header from './components/Header/Header';
import Settings from './pages/Settings/Settings';
import Calendar from './pages/Calendar/Calendar';
import './App.css'
import { Providers } from './providers/Providers';

function App() {

  return (
    <Router>
      <Providers>
        <div className="flex min-h-screen w-full flex-col font-sf">
          <Header />
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="" element={<ProtectedRoute />}>
              <Route path="home" element={<Home />} />
              <Route path="settings" element={<Settings />} />
              <Route path="calendars" element={<Calendar />} />
            </Route>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </Providers>
    </Router>
  )
}

export default App
