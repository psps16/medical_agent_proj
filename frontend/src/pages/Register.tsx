import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/Auth.css';
import { registerUser, checkEmailUserType } from '../firebase/services';
import { useAuth } from '../hooks/useAuth';
import { testFirestoreWrite } from '../utils/devTools';

const Register: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userType, setUserType] = useState<'patient' | 'doctor'>('patient');
  const [specialization, setSpecialization] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  // Test Firestore permissions on component mount
  useEffect(() => {
    testFirestoreWrite().then(success => {
      if (!success) {
        setError('Firebase permission error: You need to update your Firestore security rules. Check the console for details.');
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Basic validation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (!name || !email || !password) {
      setError('Please fill in all required fields');
      return;
    }
    
    if (userType === 'doctor' && !specialization) {
      setError('Please enter your specialization');
      return;
    }
    
    setLoading(true);
    
    try {
      // First check if the email is already registered with a different user type
      try {
        const emailCheck = await checkEmailUserType(email, userType);
        if (emailCheck.exists && emailCheck.mismatch) {
          setError(`This email is already registered as a ${emailCheck.userType}. Please use a different email or login with the correct account type.`);
          setLoading(false);
          return;
        }
      } catch (checkError: any) {
        console.error('Error checking email:', checkError);
        // Continue with registration even if this check fails
      }
      
      // Create user data object with all fields
      const userData = {
        name,
        userType,
        ...(userType === 'doctor' && { specialization }),
        createdAt: new Date()
      };

      // Register user with Firebase Authentication and store user data in Firestore
      await registerUser(email, password, userData);
      
      // Use the login function from context for compatibility
      login(userType);
      
      // Navigate to appropriate dashboard
      navigate(userType === 'doctor' ? '/doctor-dashboard' : '/patient-chat', { replace: true });
    } catch (err: any) {
      console.error('Registration error:', err);
      
      // Handle specific Firebase error codes
      if (err.code === 'auth/email-already-in-use') {
        setError('Email is already in use');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address');
      } else if (err.code === 'permission-denied' || err.message?.includes('permission') || err.message?.includes('permissions')) {
        setError('Firebase permission error: Please check Firebase security rules');
      } else {
        setError(err.message || 'Failed to register. Please try again.');
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
        <h1>Register</h1>
        
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
            <label>Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              required
            />
          </div>
          
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
              placeholder="Create a password"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
            />
          </div>
          
          {userType === 'doctor' && (
            <div className="form-group">
              <label>Specialization</label>
              <input
                type="text"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                placeholder="Enter your medical specialization"
                required
              />
            </div>
          )}
          
          <button 
            type="submit" 
            className="auth-button" 
            disabled={loading}
          >
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>
        
        <p className="auth-redirect">
          Already have an account? <Link to="/login">Login here</Link>
        </p>
      </div>
    </div>
  );
};

export default Register; 