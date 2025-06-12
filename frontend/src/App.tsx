import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import './App.css';

// Auth imports
import { useAuth, AuthProvider } from './hooks/useAuth';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import DoctorDashboard from './pages/DoctorDashboard';
import PatientChat from './pages/PatientChat';

// Landing page components
import Header from './components/Header';
import HeroSection from './components/HeroSection';
import TickerBanner from './components/TickerBanner';
import FeaturesSection from './components/FeaturesSection';
import HowItWorksSection from './components/HowItWorksSection';
import PricingSection from './components/PricingSection';

// Landing page with all sections
const LandingPage = () => (
  <div className="landing-page">
    <Header />
    <HeroSection />
    <TickerBanner />
    <FeaturesSection />
    <HowItWorksSection />
    <PricingSection />
  </div>
);

// Protected route component
const ProtectedRoute = ({ 
  children, 
  requiredUserType 
}: { 
  children: React.ReactNode;
  requiredUserType?: 'patient' | 'doctor';
}) => {
  const { isAuthenticated, userType, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Show loading indicator while checking authentication
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
        <p className="loading-subtext">Please wait while we connect to the server</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Handle case where user is authenticated but userType is missing or invalid
  if (!userType) {
    // Force logout and redirect to login
    console.error("User is authenticated but has no valid userType");
    setTimeout(() => {
      logout();
      navigate('/login', { 
        state: { 
          error: "Account type not found. Please login again with the correct account type." 
        },
        replace: true
      });
    }, 0);
    
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Authentication issue detected</p>
        <p className="loading-subtext">Redirecting to login...</p>
      </div>
    );
  }

  // If a specific user type is required and doesn't match
  if (requiredUserType && userType !== requiredUserType) {
    // Redirect to the appropriate dashboard if user type doesn't match
    return <Navigate to={userType === 'doctor' ? '/doctor-dashboard' : '/patient-chat'} replace />;
  }

  return <>{children}</>;
};

// Component that redirects based on user type
const RedirectToCorrectDashboard = () => {
  const { isAuthenticated, userType, loading } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!loading && isAuthenticated && userType) {
      navigate(userType === 'doctor' ? '/doctor-dashboard' : '/patient-chat', { replace: true });
    }
  }, [loading, isAuthenticated, userType, navigate]);
  
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
        <p className="loading-subtext">Please wait while we connect to the server</p>
      </div>
    );
  }
  
  return null;
};

// Enhanced Login component with context integration
const LoginWithAuth = () => {
  const { isAuthenticated, userType } = useAuth();
  const navigate = useNavigate();
  
  // If already authenticated, redirect to the appropriate dashboard
  useEffect(() => {
    if (isAuthenticated && userType) {
      navigate(userType === 'doctor' ? '/doctor-dashboard' : '/patient-chat', { replace: true });
    }
  }, [isAuthenticated, userType, navigate]);
  
  return <Login />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginWithAuth />} />
          <Route path="/register" element={<Register />} />
          <Route 
            path="/doctor-dashboard" 
            element={
              <ProtectedRoute requiredUserType="doctor">
                <DoctorDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/patient-chat" 
            element={
              <ProtectedRoute requiredUserType="patient">
                <PatientChat />
              </ProtectedRoute>
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <RedirectToCorrectDashboard />
      </Router>
    </AuthProvider>
  );
}

export default App;
