import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllPatients } from '../../firebase/services';

// Define Prop types reused from DoctorDashboard
interface Appointment {
  id: string;
  patientName: string;
  patientId: string;
  time: string;
  date: string;
  status: 'upcoming' | 'completed' | 'cancelled';
}

interface DoctorData {
  id: string;
  name?: string;
  specialization?: string;
  email?: string;
  [key: string]: any;
}

interface Patient {
  id: string;
  name: string;
  email: string;
  userType: string;
  createdAt: any;
  [key: string]: any;
}

interface DashboardViewProps {
  appointments: Appointment[];
  doctorInfo: DoctorData | null;
}

const DashboardView: React.FC<DashboardViewProps> = ({ appointments }) => {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    useEffect(() => {
        const fetchPatients = async () => {
            try {
                setLoading(true);
                setError(null);
                const patientsData = await getAllPatients();
                setPatients(patientsData);
            } catch (err) {
                console.error("Error fetching patients:", err);
                setError("Failed to load patients. Please try again later.");
            } finally {
                setLoading(false);
            }
        };

        fetchPatients();
    }, []);
    
    // Format the date to a more readable format
    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'N/A';
        try {
            // Handle Firestore timestamps
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleDateString();
        } catch (e) {
            return 'Invalid date';
        }
    };
    
    const upcomingAppointments = appointments.filter(app => app.status === 'upcoming').slice(0, 2); // Show max 2
    const totalAppointments = appointments.length;
    const totalPatients = patients.length;

    // Display only the first few patients on the dashboard
    const dashboardPatients = patients.slice(0, 5);

    return (
        <div className="dashboard-view">
            {/* Stats Cards */}
            <section className="stats-grid-container">
                 <div className="stat-card-neo icon-patients">
                    <h3>My Patients</h3>
                    <p className="stat-value">{totalPatients}</p>
                 </div>
                 <div className="stat-card-neo icon-appointments-today">
                     <h3>Appointments Today</h3>
                     <p className="stat-value">{appointments.filter(a => a.date === new Date().toISOString().split('T')[0]).length}</p>
                 </div>
                 <div className="stat-card-neo icon-total-appointments">
                     <h3>Total Appointments</h3>
                     <p className="stat-value">{totalAppointments}</p>
                 </div>
            </section>

            {/* Upcoming Appointments Summary */}
            <section className="upcoming-appointments-summary neo-section">
                <h2>Your Upcoming Appointments</h2>
                <div className="appointments-summary-grid">
                    {upcomingAppointments.length > 0 ? (
                        upcomingAppointments.map(app => (
                            <div key={app.id} className="appointment-summary-card neo-card-small">
                                <h4>{app.patientName}</h4>
                                <p>Time: {app.time}</p>
                            </div>
                        ))
                    ) : (
                        <p className="no-data">No upcoming appointments soon.</p>
                    )}
                </div>
            </section>

            {/* My Patients Table Summary */}
            <section className="my-patients-summary neo-section">
                 <h2>My Patients</h2>
                 {loading ? (
                    <div className="loading">Loading patients data...</div>
                 ) : error ? (
                    <div className="error-message">{error}</div>
                 ) : (
                    <div className="table-container-neo">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Registered Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dashboardPatients.map(patient => (
                                    <tr key={patient.id}>
                                        <td>{patient.name || 'N/A'}</td>
                                        <td>{patient.email || 'N/A'}</td>
                                        <td>{formatDate(patient.createdAt)}</td>
                                        <td>
                                            <button className="action-btn-neo view">View</button>
                                            <button className="action-btn-neo message">Message</button>
                                        </td>
                                    </tr>
                                ))}
                                {dashboardPatients.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="no-data">No patients found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        {patients.length > 5 && (
                            <div style={{ textAlign: 'right', padding: '0.5rem 0' }}>
                                <button 
                                    onClick={() => window.location.hash = '#patients'}
                                    className="action-btn-neo view"
                                    style={{ marginTop: '0.5rem' }}
                                >
                                    View all {patients.length} patients
                                </button>
                            </div>
                        )}
                    </div>
                 )}
            </section>
        </div>
    );
};

export default DashboardView; 