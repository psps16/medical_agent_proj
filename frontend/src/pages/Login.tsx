import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import '../styles/Auth.css';
import { loginUser } from '../firebase/services';
import { useAuth } from '../hooks/useAuth';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState<'patient' | 'doctor'>('patient');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // Check for error passed via navigation state
  useEffect(() => {
    const locationState = location.state as { error?: string } | null;
    if (locationState?.error) {
      setError(locationState.error);
      // Clear the error from navigation state
      navigate('/login', { replace: true });
    }
  }, [location.state, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    
    setLoading(true);
    
    try {
      // Sign in with Firebase Authentication, passing the selected user type
      await loginUser(email, password, userType);
      
      // The Auth state listener in App.tsx will handle the redirect
      // But we can still handle user type for compatibility
      login(userType);
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed login attempts. Please try again later.');
      } else if (err.message && err.message.includes('registered as a')) {
        // This is our custom error for account type mismatch
        setError(err.message);
      } else if (err.code === 'permission-denied' || err.message?.includes('permission') || err.message?.includes('permissions')) {
        setError('Firebase permission error: Please check Firebase security rules');
      } else {
        // Show generic error for other cases
        setError('Failed to login. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <Link to="/" className="back-home-btn">
        <span>←</span> Back to Home
      </Link>
      
      <div className="auth-card">
        <h1>Login</h1>
        
        <div className="user-type-toggle">
          <button 
            className={userType === 'patient' ? 'active' : ''}
            onClick={() => setUserType('patient')}
            type="button"
          >
            Patient
          </button>
          <button 
            className={userType === 'doctor' ? 'active' : ''}
            onClick={() => setUserType('doctor')}
            type="button"
          >
            Doctor
          </button>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          
          <button 
            type="submit" 
            className="auth-button" 
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        
        <p className="auth-redirect">
          Don't have an account? <Link to="/register">Register here</Link>
        </p>
      </div>
    </div>
  );
};

export default Login; 