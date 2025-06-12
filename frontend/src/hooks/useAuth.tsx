import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthChanged, getUserData, logoutUser } from '../firebase/services';

// Auth context
interface AuthContextType {
  isAuthenticated: boolean;
  userType: 'patient' | 'doctor' | null;
  loading: boolean;
  userId: string | null;
  userData: any | null;
  login: (userType: 'patient' | 'doctor') => void;
  logout: () => void;
}

// Create the Auth Context
const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  userType: null,
  loading: true,
  userId: null,
  userData: null,
  login: () => {},
  logout: () => {}
});

// Custom hook to use the Auth Context
export const useAuth = () => useContext(AuthContext);

// Auth Provider component
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userType, setUserType] = useState<'patient' | 'doctor' | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userData, setUserData] = useState<any | null>(null);

  // Initialize auth state from Firebase Auth on component mount
  useEffect(() => {
    console.log("AuthProvider initializing...");
    let authTimeout: NodeJS.Timeout;
    
    const unsubscribe = onAuthChanged(async (user) => {
      try {
        console.log("Auth state changed. User:", user ? `User ID: ${user.uid}` : "No user");
        
        if (user) {
          // User is signed in
          setIsAuthenticated(true);
          setUserId(user.uid);
          
          // Get additional user data from Firestore
          try {
            const userData = await getUserData(user.uid);
            if (userData) {
              // Ensure we have name data (from Firestore or Auth)
              if (!userData.name && user.displayName) {
                userData.name = user.displayName;
              }
              
              setUserData(userData);
              
              // Only set userType if it's explicitly defined in userData
              // This ensures we honor the stored type and don't use defaults
              if (userData.userType && ['patient', 'doctor'].includes(userData.userType)) {
                setUserType(userData.userType);
                console.log(`User type set from Firestore: ${userData.userType}`);
              } else {
                console.warn("User has no valid userType in Firestore - using fallback");
                // Fallback: if we can't get a valid userType from Firestore,
                // We'll use the displayName or email to indicate we're authenticated
                setUserData({
                  ...userData,
                  name: userData.name || user.displayName || '',
                  email: userData.email || user.email || ''
                });
              }
              
              console.log("User data loaded:", userData);
            } else {
              // Create minimal user data from Firebase Auth
              const minimalUserData = {
                name: user.displayName,
                email: user.email
              };
              setUserData(minimalUserData);
              console.log("Minimal user data created:", minimalUserData);
            }
          } catch (error) {
            console.error("Error getting user data:", error);
            // Even on error, set minimal userData from auth
            setUserData({
              name: user.displayName,
              email: user.email
            });
          }
        } else {
          // User is signed out
          console.log("User is signed out");
          setIsAuthenticated(false);
          setUserType(null);
          setUserId(null);
          setUserData(null);
        }
      } catch (error) {
        console.error("Error in auth state change handler:", error);
      } finally {
        // Set a timeout to ensure loading state doesn't get stuck
        authTimeout = setTimeout(() => {
          if (loading) {
            console.log("Auth loading timeout reached, setting loading to false");
            setLoading(false);
          }
        }, 5000); // 5 second timeout as a fallback
        
        // Normal flow - set loading to false
        setLoading(false);
      }
    });
    
    // Cleanup subscription and timeout
    return () => {
      clearTimeout(authTimeout);
      unsubscribe();
    };
  }, []);

  const login = (type: 'patient' | 'doctor') => {
    // This function is now mostly for compatibility
    // Real login happens in the Login component with Firebase
    setUserType(type);
  };

  const logout = async () => {
    try {
      await logoutUser();
      // Auth state change listener will handle the rest
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      userType, 
      loading, 
      userId,
      userData,
      login, 
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
}; 