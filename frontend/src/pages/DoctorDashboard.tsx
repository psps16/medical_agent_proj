import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import '../styles/Dashboard.css';
import { getDoctorById, getAppointmentsForDoctor, getUserData, cleanupExpiredTimeSlots, ensureDoctorDocument } from '../firebase/services';

// Import actual view components
import DashboardView from './components/DashboardView';
import PatientsView from './components/PatientsView';
import AppointmentsView from './components/AppointmentsView';

interface Appointment {
  id: string;
  patientName: string;
  patientId: string;
  time: string; // Consider storing time and date together
  date: string; // ISO string format expected by FullCalendar
  status: 'upcoming' | 'completed' | 'cancelled';
}

interface DoctorData {
  id: string;
  name?: string;
  specialization?: string;
  email?: string;
  [key: string]: any;
}

// Define Prop types used by child components - remove if defined within each component
// interface DashboardViewProps { ... }
// interface PatientsViewProps { ... }
// interface AppointmentsViewProps { ... }

type DoctorView = 'dashboard' | 'patients' | 'appointments';

const DoctorDashboard: React.FC = () => {
  const { logout, userId, userData } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctorInfo, setDoctorInfo] = useState<DoctorData | null>(null);
  const [activeView, setActiveView] = useState<DoctorView>('dashboard');

  useEffect(() => {
    const fetchDoctorData = async () => {
      if (!userId) return;
      
      try {
        setLoading(true);
        
        // Get doctor data from Firestore user document or separate doctor doc
        const fetchedUserData = userData || await getUserData(userId);
        const doctorData = await getDoctorById(userId) as DoctorData;

        console.log("[DEBUG] Doctor dashboard - userId:", userId);
        console.log("[DEBUG] Doctor dashboard - doctorData:", doctorData);

        // Ensure the doctor document exists
        try {
          // Basic doctor data to use for document creation/repair
          const docData = {
            name: doctorData?.name || fetchedUserData?.name || 'Unknown Doctor',
            email: fetchedUserData?.email || '',
            specialization: doctorData?.specialization || fetchedUserData?.specialization || 'General'
          };
          
          // Ensure we have a doctor document in Firestore
          await ensureDoctorDocument(userId, docData);
          console.log("[DEBUG] Ensured doctor document exists");
          
          // Clean up expired time slots
          try {
            console.log("[DEBUG] Running cleanup of expired time slots");
            const cleanupResult = await cleanupExpiredTimeSlots(userId);
            console.log(`[DEBUG] Expired slots cleanup: ${cleanupResult.removedCount} slots removed`);
          } catch (cleanupErr) {
            console.error("[DEBUG] Error cleaning up expired slots:", cleanupErr);
          }
        } catch (ensureErr) {
          console.error("[DEBUG] Error ensuring doctor document:", ensureErr);
          // Continue - we can still use the data we have
        }

        if (fetchedUserData) {
            setDoctorInfo({
                id: userId,
                name: doctorData?.name || fetchedUserData?.name || '',
                specialization: doctorData?.specialization || fetchedUserData?.specialization || '',
                email: fetchedUserData?.email || ''
            });
            
            console.log("[DEBUG] Doctor info set:", {
                id: userId,
                name: doctorData?.name || fetchedUserData?.name || '',
                specialization: doctorData?.specialization || fetchedUserData?.specialization || '',
            });
        } else {
            console.warn("Could not fetch doctor information.");
            // Still set doctorInfo with at least the ID to prevent errors
            setDoctorInfo({
                id: userId,
                name: 'Unknown Doctor',
                specialization: '',
                email: ''
            });
            console.log("[DEBUG] Set fallback doctor info with ID:", userId);
        }
        
        // Fetch appointments from Firestore
        try {
          const appointmentsData = await getAppointmentsForDoctor(userId);
          
          if (appointmentsData && appointmentsData.length > 0) {
            const formattedAppointments = appointmentsData.map((appt: any) => {
              // Determine how to extract the date
              let appointmentDate;
              
              if (appt.date && typeof appt.date.toDate === 'function') {
                // Firestore Timestamp object
                appointmentDate = appt.date.toDate().toISOString().split('T')[0];
              } else if (appt.formattedDate && appt.formattedDate.iso) {
                // Our formatted date object
                appointmentDate = appt.formattedDate.iso;
              } else if (typeof appt.date === 'string') {
                // String date
                appointmentDate = appt.date;
              } else {
                // Fallback to today's date
                appointmentDate = new Date().toISOString().split('T')[0];
              }
              
              return {
                id: appt.id,
                patientName: appt.patientName,
                patientId: appt.patientId || 'unknown',
                time: appt.time,
                date: appointmentDate,
                status: appt.status || 'upcoming'
              };
            });
            
            setAppointments(formattedAppointments);
          } else {
            // No appointments, use empty array
            setAppointments([]);
          }
        } catch (appointmentErr) {
          console.error("Error fetching appointments:", appointmentErr);
          // Use empty array for appointments
          setAppointments([]);
        }
      } catch (error) {
        console.error("Error fetching doctor data:", error);
        
        // Still set doctor info with the userId to prevent errors
        if (userId) {
          setDoctorInfo({
            id: userId,
            name: 'Doctor',
            specialization: '',
            email: ''
          });
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchDoctorData();
    
    // Set up an interval to clean up expired slots periodically
    const cleanupInterval = setInterval(async () => {
      if (userId) {
        try {
          console.log("[DEBUG] Running scheduled cleanup of expired slots");
          const cleanupResult = await cleanupExpiredTimeSlots(userId);
          console.log(`[DEBUG] Scheduled cleanup: ${cleanupResult.removedCount} expired slots removed`);
        } catch (error) {
          console.error("[DEBUG] Error in scheduled cleanup:", error);
        }
      }
    }, 30 * 60 * 1000); // Run every 30 minutes
    
    return () => {
      clearInterval(cleanupInterval);
    };
  }, [userId, userData]);

  // Add refreshAppointments function to reload appointments
  const refreshAppointments = async () => {
    if (!userId) return;
    
    try {
      console.log("Refreshing appointments data...");
      setLoading(true);
      
      // Fetch fresh appointments data
      const appointmentsData = await getAppointmentsForDoctor(userId);
      
      if (appointmentsData && appointmentsData.length > 0) {
        const formattedAppointments = appointmentsData.map((appt: any) => {
          // Determine how to extract the date
          let appointmentDate;
          
          if (appt.date && typeof appt.date.toDate === 'function') {
            // Firestore Timestamp object
            appointmentDate = appt.date.toDate().toISOString().split('T')[0];
          } else if (appt.formattedDate && appt.formattedDate.iso) {
            // Our formatted date object
            appointmentDate = appt.formattedDate.iso;
          } else if (typeof appt.date === 'string') {
            // String date
            appointmentDate = appt.date;
          } else {
            // Fallback to today's date
            appointmentDate = new Date().toISOString().split('T')[0];
          }
          
          return {
            id: appt.id,
            patientName: appt.patientName,
            patientId: appt.patientId || 'unknown',
            time: appt.time,
            date: appointmentDate,
            status: appt.status || 'upcoming'
          };
        });
        
        setAppointments(formattedAppointments);
        console.log(`Refreshed ${formattedAppointments.length} appointments`);
      } else {
        setAppointments([]);
        console.log("No appointments found during refresh");
      }
    } catch (error) {
      console.error("Error refreshing appointments:", error);
    } finally {
      setLoading(false);
    }
  };

  // Handle hash navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'patients') {
        setActiveView('patients');
      } else if (hash === 'appointments') {
        setActiveView('appointments');
      } else if (hash === 'dashboard') {
        setActiveView('dashboard');
      }
    };

    // Set initial view based on hash if available
    handleHashChange();

    // Add event listener for hash changes
    window.addEventListener('hashchange', handleHashChange);
    
    // Clean up event listener
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderActiveView = () => {
    // Ensure doctorInfo and appointments are never null
    const safeDoctorInfo = doctorInfo || { id: userId || 'unknown' };
    const safeAppointments = Array.isArray(appointments) ? appointments : [];
    
    switch (activeView) {
      case 'patients':
        return <PatientsView doctorInfo={safeDoctorInfo} />;
      case 'appointments':
        return <AppointmentsView 
          appointments={safeAppointments} 
          doctorInfo={safeDoctorInfo} 
          refreshAppointments={refreshAppointments}
        />;
      case 'dashboard':
      default:
        return <DashboardView appointments={safeAppointments} doctorInfo={safeDoctorInfo} />;
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading Doctor Portal...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container full-page-neo">
      <aside className="dashboard-sidebar neo-sidebar">
        <div className="sidebar-header">
          <h2><span className="medi-text">Medi</span><span className="agent-text">Agent</span></h2>
          <span>Doctor Portal</span>
        </div>
        
        <div className="doctor-profile neo-card">
          <div className="profile-image">
            <span className="icon">👤</span> 
          </div>
          <div className="profile-info">
            <h3>{doctorInfo?.name || 'Doctor Name'}</h3>
            <p className="specialization">{doctorInfo?.specialization || 'Specialization'}</p>
            <p className="email"><strong>Email:</strong> {doctorInfo?.email || 'Email not available'}</p>
          </div>
        </div>
        
        <div className="dashboard-nav">
          <button 
            className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
            onClick={() => {
              window.location.hash = 'dashboard';
              setActiveView('dashboard');
            }}
          >
            <span className="icon">📊</span> 
            <span className="nav-text">Dashboard</span>
          </button>
          <button 
            className={`nav-item ${activeView === 'patients' ? 'active' : ''}`}
            onClick={() => {
              window.location.hash = 'patients';
              setActiveView('patients');
            }}
          >
            <span className="icon">👥</span> 
            <span className="nav-text">Patients</span>
          </button>
          <button 
            className={`nav-item ${activeView === 'appointments' ? 'active' : ''}`}
            onClick={() => {
              window.location.hash = 'appointments';
              setActiveView('appointments');
            }}
          >
            <span className="icon">📅</span> 
            <span className="nav-text">Appointments</span>
          </button>
        </div>
        
        <button onClick={handleLogout} className="logout-btn neo-button">
          <span className="icon">🚪</span> 
          <span className="nav-text">Sign Out</span>
        </button>
      </aside>
      
      <main className="dashboard-main">
        <header className="dashboard-header">
          <h1>{activeView.charAt(0).toUpperCase() + activeView.slice(1)}</h1>
        </header>
        
        <div className="dashboard-content neo-card">
            {renderActiveView()}
        </div>
      </main>
    </div>
  );
};

export default DoctorDashboard; 