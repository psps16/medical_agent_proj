import React, { useState, useEffect } from 'react';
import { getAllPatients } from '../../firebase/services';

// Define Prop types reused from DoctorDashboard
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

interface PatientsViewProps {
  doctorInfo: DoctorData | null;
}

const PatientsView: React.FC<PatientsViewProps> = ({ doctorInfo }) => {
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

    if (loading) {
        return <div className="loading">Loading patients data...</div>;
    }

    if (error) {
        return <div className="error-message">{error}</div>;
    }

    return (
        <div className="patients-view">
            <div className="view-header">
                <h2>Patient Management</h2>
                <p>View and manage your patients and their medical records.</p>
            </div>

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
                         {patients.map(patient => (
                             <tr key={patient.id}>
                                 <td>{patient.name || 'N/A'}</td>
                                 <td>{patient.email || 'N/A'}</td>
                                 <td>{formatDate(patient.createdAt)}</td>
                                 <td>
                                     <button className="action-btn-neo view">View Details</button>
                                     <button className="action-btn-neo update">Send Message</button>
                                 </td>
                             </tr>
                         ))}
                         {patients.length === 0 && (
                            <tr>
                                <td colSpan={4} className="no-data">No patients found.</td>
                            </tr>
                         )}
                     </tbody>
                 </table>
             </div>
        </div>
    );
};

export default PatientsView; 