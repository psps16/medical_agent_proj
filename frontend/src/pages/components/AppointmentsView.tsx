import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction'; // for dateClick
import { getDoctorAvailability, addDoctorAvailability, removeDoctorAvailability, updateAppointmentStatus, ensureDoctorDocument, repairDoctorDocument, cleanupExpiredTimeSlots } from '../../firebase/services';

// Define Prop types reused from DoctorDashboard
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

interface AppointmentsViewProps {
  appointments: Appointment[];
  doctorInfo: DoctorData | null;
  refreshAppointments?: () => void; // Add optional refresh callback
}

// Define time slots for a day
const TIME_SLOTS = [
    '9:00', '9:30', '10:00', '10:30', '11:00', '11:30', 
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', 
    '15:00', '15:30', '16:00', '16:30', '17:00'
];

// Generate dates for the next 14 days
const generateDates = () => {
    const dates = [];
    const today = new Date();
    
    for (let i = 0; i < 14; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        dates.push(date);
    }
    
    return dates;
};

// Add a real-time listener for doctor availability
const setupRealTimeAvailabilityListener = (doctorId: string, callback: (slots: string[]) => void) => {
    if (!doctorId) return null;
    
    // Import onSnapshot to listen for real-time updates
    const { onSnapshot, doc } = require('firebase/firestore');
    const { db } = require('../../firebase/config');
    
    // Set up a listener on the doctor document
    const doctorRef = doc(db, `doctors/${doctorId}`);
    
    // Listen for changes to the doctor document
    const unsubscribe = onSnapshot(doctorRef, (docSnapshot: any) => {
        if (docSnapshot.exists()) {
            const slots = docSnapshot.data().Slots_available || [];
            // Ensure slots is always an array
            const safeSlots = Array.isArray(slots) ? slots : [];
            console.log('Real-time update: Doctor availability changed', safeSlots.length);
            callback(safeSlots);
        } else {
            console.log('Real-time update: Doctor document does not exist');
            callback([]);
        }
    }, (error: any) => {
        console.error("[DEBUG] Error in real-time listener:", error);
        // Don't set any error state, just log it and return empty array
        callback([]);
    });
    
    return unsubscribe;
};

const AppointmentsView: React.FC<AppointmentsViewProps> = ({ appointments, doctorInfo, refreshAppointments }) => {
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    
    // State for the add availability modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedTimeSlots, setSelectedTimeSlots] = useState<string[]>([]);
    
    // State for refreshing
    const [refreshKey, setRefreshKey] = useState(0);
    
    // Add debugging for Firebase connection
    useEffect(() => {
        // Check if Firebase is properly initialized - never show errors to user
        try {
            const { db } = require('../../firebase/config');
            if (db) {
                console.log("[DEBUG] Firebase connection appears to be initialized");
            } else {
                console.error("[DEBUG] Firebase db is not available!");
                // Don't set any error state, just log
            }
        } catch (err) {
            console.error("[DEBUG] Error checking Firebase connection:", err);
            // Don't set any error state, just log
        }
    }, []);
    
    // Fetch doctor's available slots and set up real-time listener
    useEffect(() => {
        let unsubscribe: any = null;
        
        const fetchAndSetupListener = async () => {
            if (!doctorInfo?.id) {
                setLoading(false);
                return;
            }
            
            try {
                setLoading(true);
                // Don't set any error state
                
                console.log("[DEBUG] Fetching availability slots for doctor:", doctorInfo.id);
                
                // First, ensure the doctor document exists
                try {
                    console.log("[DEBUG] Ensuring doctor document exists");
                    const docData = {
                        name: doctorInfo?.name || 'Unknown Doctor',
                        email: doctorInfo?.email || '',
                        specialization: doctorInfo?.specialization || 'General'
                    };
                    
                    await ensureDoctorDocument(doctorInfo.id, docData);
                    
                    // Also repair the document if it exists but is corrupted
                    console.log("[DEBUG] Checking if doctor document needs repair");
                    await repairDoctorDocument(doctorInfo.id, docData);
                } catch (ensureErr) {
                    console.error("[DEBUG] Error ensuring/repairing doctor document:", ensureErr);
                    // Continue anyway - maybe the document already exists
                }
                
                // Initial fetch - wrap in try/catch to handle any errors
                try {
                    const slots = await getDoctorAvailability(doctorInfo.id);
                    // Always treat empty slots as success, not an error condition
                    const safeSlots = Array.isArray(slots) ? slots : [];
                    setAvailableSlots(safeSlots);
                    
                    console.log(`[DEBUG] Initial fetch complete. Got ${safeSlots.length} slots`);
                } catch (fetchErr) {
                    console.error("[DEBUG] Error in initial slot fetch:", fetchErr);
                    // Don't set error, just continue with empty slots
                    setAvailableSlots([]);
                }
                
                // Set up real-time listener - even if initial fetch failed
                try {
                    console.log("[DEBUG] Setting up real-time listener for doctor:", doctorInfo.id);
                    
                    // Use the helper function to set up the listener
                    unsubscribe = setupRealTimeAvailabilityListener(doctorInfo.id, (slots) => {
                        // This callback will receive slots data or empty array on error
                        setAvailableSlots(slots);
                    });
                    
                } catch (listenerErr) {
                    console.error("[DEBUG] Error setting up real-time listener:", listenerErr);
                    // Don't set any error, just log it
                    console.log("[DEBUG] Will continue with empty slots array");
                }
                
            } catch (err) {
                console.error("[DEBUG] Unexpected error in fetchAndSetupListener:", err);
                // Don't set any error, just log it
                console.log("[DEBUG] Will continue with empty slots array");
            } finally {
                setLoading(false);
            }
        };
        
        fetchAndSetupListener();
        
        // Set up interval to cleanup expired slots every hour
        const cleanupInterval = setInterval(async () => {
            if (doctorInfo?.id) {
                console.log("[DEBUG] Running scheduled cleanup of expired slots");
                try {
                    const cleanupResult = await cleanupExpiredTimeSlots(doctorInfo.id);
                    console.log(`[DEBUG] Scheduled cleanup: ${cleanupResult.removedCount} expired slots removed`);
                } catch (error) {
                    console.error("[DEBUG] Error in scheduled cleanup:", error);
                }
            }
        }, 60 * 60 * 1000); // Run every hour
        
        // Clean up listener and interval when component unmounts
        return () => {
            if (unsubscribe) {
                console.log("[DEBUG] Cleaning up real-time listener");
                unsubscribe();
            }
            clearInterval(cleanupInterval);
        };
    }, [doctorInfo?.id, refreshKey]);
    
    // Check for past appointments and mark them as completed
    useEffect(() => {
        const checkPastAppointments = async () => {
            if (!appointments?.length) return;
            
            const now = new Date();
            const pastAppointments = appointments.filter(app => {
                if (app.status !== 'upcoming') return false;
                
                const appointmentDateTime = new Date(`${app.date}T${app.time}`);
                return appointmentDateTime < now;
            });
            
            // Update past appointments to completed status
            if (pastAppointments.length > 0) {
                console.log(`Found ${pastAppointments.length} past appointments to mark as completed`);
                for (const app of pastAppointments) {
                    try {
                        await updateAppointmentStatus(app.id, 'completed');
                        console.log(`Marked appointment ${app.id} as completed`);
                    } catch (err) {
                        console.error(`Error updating appointment ${app.id}:`, err);
                    }
                }
                
                // After updating appointments, also clean up expired time slots
                if (doctorInfo?.id) {
                    try {
                        console.log(`[DEBUG] Running cleanup after marking appointments as completed`);
                        const cleanupResult = await cleanupExpiredTimeSlots(doctorInfo.id);
                        console.log(`[DEBUG] Post-appointment cleanup: ${cleanupResult.removedCount} expired slots removed`);
                    } catch (cleanupErr) {
                        console.error(`[DEBUG] Error in post-appointment cleanup:`, cleanupErr);
                    }
                }
                
                // Refresh appointments list if callback provided
                if (refreshAppointments) {
                    refreshAppointments();
                }
            }
            
            // Even if no past appointments, still clean up any expired slots
            if (doctorInfo?.id) {
                try {
                    console.log(`[DEBUG] Running regular cleanup of expired time slots`);
                    await cleanupExpiredTimeSlots(doctorInfo.id);
                } catch (err) {
                    console.error(`[DEBUG] Error in regular slot cleanup:`, err);
                }
            }
        };
        
        // Run the check immediately
        checkPastAppointments();
        
        // Also set up an interval to check regularly
        const checkInterval = setInterval(checkPastAppointments, 5 * 60 * 1000); // Check every 5 minutes
        
        return () => clearInterval(checkInterval);
    }, [appointments, doctorInfo?.id, refreshAppointments]);
    
    // Format appointments for FullCalendar
    const calendarEvents = appointments.map(app => ({
        id: app.id,
        title: `Patient: ${app.patientName}`,
        start: `${app.date}T${app.time}`, 
        backgroundColor: app.status === 'completed' ? '#4caf50' : app.status === 'cancelled' ? '#f44336' : '#2196f3',
        borderColor: app.status === 'completed' ? '#388e3c' : app.status === 'cancelled' ? '#d32f2f' : '#1976d2',
        textColor: '#ffffff',
        extendedProps: {
            status: app.status,
            patient: app.patientName,
            type: 'appointment'
        }
    }));
    
    // Add available slots to calendar events with a different color
    const availabilityEvents = availableSlots.map(slot => {
        try {
            // Parse slot format "2023-06-15-14:00" to extract date and time
            const parts = slot.split('-');
            let dateStr, timeStr;
            
            if (parts.length >= 4) {
                // Slot has a date component: YYYY-MM-DD-HH:MM
                dateStr = `${parts[0]}-${parts[1]}-${parts[2]}`;
                timeStr = parts[3];
            } else {
                // Older format without date
                dateStr = new Date().toISOString().split('T')[0]; // Today
                timeStr = slot;
            }
            
            return {
                id: `avail-${slot}`,
                title: 'Available',
                start: `${dateStr}T${timeStr}`,
                backgroundColor: '#9e9e9e',
                borderColor: '#757575',
                textColor: '#ffffff',
                extendedProps: {
                    type: 'availability'
                }
            };
        } catch (err) {
            console.error(`Error parsing slot format for: ${slot}`, err);
            return null; // Return null for invalid slots
        }
    }).filter((event): event is {
        id: string;
        title: string;
        start: string;
        backgroundColor: string;
        borderColor: string;
        textColor: string;
        extendedProps: { type: string };
    } => event !== null); // Filter out null entries from invalid slots
    
    // Combine appointments and availability into one array for the calendar
    const allEvents = [...calendarEvents, ...availabilityEvents];
    
    // Handle adding new availability
    const handleAddAvailability = () => {
        setSelectedDate(new Date());
        setSelectedTimeSlots([]);
        setShowAddModal(true);
    };
    
    // Handle date selection in the modal
    const handleDateChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const dateString = event.target.value;
        setSelectedDate(new Date(dateString));
    };
    
    // Handle time slot selection in the modal
    const handleTimeSlotToggle = (timeSlot: string) => {
        if (selectedTimeSlots.includes(timeSlot)) {
            // Remove time slot if already selected
            setSelectedTimeSlots(selectedTimeSlots.filter(slot => slot !== timeSlot));
        } else {
            // Add time slot if not already selected
            setSelectedTimeSlots([...selectedTimeSlots, timeSlot]);
        }
    };
    
    // Save selected availability to Firestore
    const handleSaveAvailability = async () => {
        if (!doctorInfo?.id || !selectedDate || selectedTimeSlots.length === 0) {
            alert('Please select a date and at least one time slot');
            return;
        }
        
        try {
            setLoading(true);
            // Don't set any error states
            
            // Format slots as YYYY-MM-DD-HH:MM
            const formattedDate = selectedDate.toISOString().split('T')[0];
            const formattedSlots = selectedTimeSlots.map(time => `${formattedDate}-${time}`);
            
            console.log(`Adding ${formattedSlots.length} slots for doctor ${doctorInfo.id}`);
            const updatedSlots = await addDoctorAvailability(doctorInfo.id, formattedSlots);
            
            // Ensure returned slots is an array
            const safeUpdatedSlots = Array.isArray(updatedSlots) ? updatedSlots : [];
            setAvailableSlots(safeUpdatedSlots);
            setShowAddModal(false);
            console.log(`Successfully saved ${formattedSlots.length} availability slots`);
        } catch (err) {
            console.error("Error saving availability:", err);
            // Don't set any error states, just alert
            alert('There was an issue adding availability. Please try again.');
        } finally {
            setLoading(false);
        }
    };
    
    // Remove an availability slot
    const handleRemoveSlot = async (slot: string) => {
        if (!doctorInfo?.id) return;
        
        try {
            setLoading(true);
            // Don't set any error states
            
            console.log(`Removing slot ${slot} for doctor ${doctorInfo.id}`);
            const updatedSlots = await removeDoctorAvailability(doctorInfo.id, slot);
            
            // Ensure returned slots is an array
            const safeUpdatedSlots = Array.isArray(updatedSlots) ? updatedSlots : [];
            setAvailableSlots(safeUpdatedSlots);
            console.log(`Successfully removed slot. ${safeUpdatedSlots.length} slots remaining`);
        } catch (err) {
            console.error("Error removing availability:", err);
            // Don't set any error states, just alert
            alert('There was an issue removing the slot. Please try again.');
        } finally {
            setLoading(false);
        }
    };
    
    // Mark an appointment as completed
    const handleCompleteAppointment = async (appointmentId: string) => {
        try {
            setLoading(true);
            await updateAppointmentStatus(appointmentId, 'completed');
            // Don't set any error states
            
            // Refresh appointments list if callback provided
            if (refreshAppointments) {
                refreshAppointments();
            }
        } catch (err) {
            console.error("Error completing appointment:", err);
            // Don't set any error states, just alert
            alert('There was an issue marking the appointment as completed. Please try again.');
        } finally {
            setLoading(false);
        }
    };
    
    // Format slot for display: convert "2023-06-15-14:00" to "Jun 15, 2023 at 2:00 PM"
    const formatSlotForDisplay = (slot: string) => {
        try {
            const parts = slot.split('-');
            if (parts.length >= 4) {
                // Slot has a date component: YYYY-MM-DD-HH:MM
                const year = parts[0];
                const month = parseInt(parts[1]) - 1;
                const day = parts[2];
                const time = parts[3];
                
                if (isNaN(parseInt(year)) || isNaN(month) || isNaN(parseInt(day))) {
                    console.warn(`Invalid date format in slot: ${slot}`);
                    return slot; // Return raw slot if date is invalid
                }
                
                const date = new Date(parseInt(year), month, parseInt(day));
                if (isNaN(date.getTime())) {
                    console.warn(`Invalid date created from slot: ${slot}`);
                    return slot;
                }
                
                const formattedDate = date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                });
                
                // Format time from 24h to 12h
                if (!/^\d{1,2}:\d{2}$/.test(time)) {
                    console.warn(`Invalid time format in slot: ${time}`);
                    return `${formattedDate} at ${time}`;
                }
                
                const timeParts = time.split(':');
                const hour = parseInt(timeParts[0]);
                const minute = timeParts[1];
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const hour12 = hour % 12 || 12;
                const formattedTime = `${hour12}:${minute} ${ampm}`;
                
                return `${formattedDate} at ${formattedTime}`;
            }
            
            // Older format without date
            return slot;
        } catch (err) {
            console.error(`Error formatting slot for display: ${slot}`, err);
            return slot; // Return the original slot string if formatting fails
        }
    };
    
    // Add a refresh function
    const refreshAvailability = () => {
        // Don't set any error state
        console.log("Refreshing availability slots...");
        setRefreshKey(prevKey => prevKey + 1);
        if (refreshAppointments) {
            refreshAppointments();
        }
    };
    
    // For debugging - this shows in the UI what slots were loaded
    useEffect(() => {
        if (availableSlots && availableSlots.length > 0) {
            console.log("Current available slots:", availableSlots);
        }
    }, [availableSlots]);
    
    if (loading && !showAddModal) {
        return <div className="loading">Loading appointment data...</div>;
    }

    return (
        <div className="appointments-view">
            {/* Header Section */}
            <div className="view-header with-button">
                <div>
                    <h2>Appointments Calendar</h2>
                    <p>Manage your schedule and upcoming appointments.</p>
                </div>
                <div className="action-buttons">
                    <button className="action-btn-neo secondary" onClick={refreshAvailability} title="Refresh availability slots">
                        🔄 Refresh
                    </button>
                <button className="action-btn-neo primary" onClick={handleAddAvailability}>
                   + Add Availability
                </button>
                </div>
            </div>

            {/* Available Slots Section */}
            <div className="availability-section">
                <h3>Your Availability Slots</h3>
                {availableSlots.length === 0 ? (
                    <div className="no-data-message">
                        {loading ? (
                            <p>Loading availability slots...</p>
                        ) : (
                            <div>
                                <p style={{fontWeight: 'bold', marginBottom: '10px'}}>No availability slots set up yet</p>
                                <p>Click the "Add Availability" button above to add times when you're available for patient appointments.</p>
                                <button 
                                    className="action-btn-neo primary"
                                    onClick={handleAddAvailability}
                                    style={{ marginTop: '15px' }}
                                >
                                    + Add Availability
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="slots-container">
                        <p>You have {availableSlots.length} availability slots:</p>
                        <div className="slot-tags">
                            {availableSlots.map((slot, index) => {
                                // Skip invalid slots
                                if (!slot || typeof slot !== 'string') {
                                    console.warn(`Invalid slot at index ${index}:`, slot);
                                    return null;
                                }
                                
                                return (
                                    <div key={index} className="slot-tag">
                                        <span className="slot-text">{formatSlotForDisplay(slot)}</span>
                                        <button 
                                            className="remove-slot-btn" 
                                            onClick={() => handleRemoveSlot(slot)}
                                            title="Remove this slot"
                                        >
                                            ×
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Past Appointments Section */}
            <div className="appointments-section">
                <h3>Upcoming Appointments</h3>
                {appointments.filter(app => app.status === 'upcoming').length === 0 ? (
                    <div className="no-data-message">
                        <p>You have no upcoming appointments.</p>
                </div>
                ) : (
                    <div className="table-container-neo">
                        <table>
                            <thead>
                                <tr>
                                    <th>Patient Name</th>
                                    <th>Date</th>
                                    <th>Time</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {appointments
                                    .filter(app => app.status === 'upcoming')
                                    .sort((a, b) => {
                                        const dateA = new Date(`${a.date}T${a.time}`);
                                        const dateB = new Date(`${b.date}T${b.time}`);
                                        return dateA.getTime() - dateB.getTime();
                                    })
                                    .map((appointment) => {
                                        const appointmentDate = new Date(`${appointment.date}T${appointment.time}`);
                                        const isPast = appointmentDate < new Date();
                                        
                                        return (
                                            <tr key={appointment.id}>
                                                <td>{appointment.patientName}</td>
                                                <td>{new Date(appointment.date).toLocaleDateString()}</td>
                                                <td>{appointment.time}</td>
                                                <td>
                                                    <button 
                                                        className="action-btn-neo view"
                                                        onClick={() => handleCompleteAppointment(appointment.id)}
                                                        disabled={!isPast}
                                                        title={isPast ? "Mark as completed" : "Cannot complete future appointments"}
                                                    >
                                                        {isPast ? "Complete" : "Upcoming"}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Calendar Section */}
            <div className="calendar-container">
                 <FullCalendar
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="timeGridWeek"
                    headerToolbar={{
                        left: 'prev,next today',
                        center: 'title',
                        right: 'dayGridMonth,timeGridWeek,timeGridDay'
                    }}
                    events={allEvents}
                    height="auto"
                    eventClick={(info) => {
                        // Handle event click differently based on event type
                        const eventType = info.event.extendedProps?.type;
                        
                        if (eventType === 'availability') {
                            // For availability slots, show remove option
                            const slot = info.event.id.replace('avail-', '');
                            if (window.confirm(`Remove this availability slot: ${formatSlotForDisplay(slot)}?`)) {
                                handleRemoveSlot(slot);
                            }
                        } else if (eventType === 'appointment') {
                            // For appointments, show details and complete option
                            const appointmentId = info.event.id;
                            const status = info.event.extendedProps?.status;
                            const patient = info.event.extendedProps?.patient;
                            const appointmentTime = info.event.start;
                            
                            if (status === 'upcoming' && appointmentTime && appointmentTime < new Date()) {
                                if (window.confirm(`Mark appointment with ${patient} as completed?`)) {
                                    handleCompleteAppointment(appointmentId);
                                }
                            } else {
                                alert(`
                                    Patient: ${patient || 'Unknown'}
                                    Status: ${status || 'upcoming'}
                                    Time: ${info.event.start?.toLocaleTimeString()}
                                `);
                            }
                        }
                    }}
                    eventContent={(eventInfo) => {
                        return (
                            <div className={`calendar-event ${eventInfo.event.extendedProps?.type === 'availability' ? 'availability-event' : 'appointment-event'}`}>
                                <div className="event-title">{eventInfo.event.title}</div>
                                <div className="event-time">{eventInfo.timeText}</div>
                            </div>
                        );
                    }}
                />
            </div>

            {/* Completed Appointments Section */}
            <div className="appointments-section">
                <h3>Completed Appointments</h3>
                {appointments.filter(app => app.status === 'completed').length === 0 ? (
                    <div className="no-data-message">
                        <p>You have no completed appointments.</p>
                    </div>
                ) : (
                 <div className="table-container-neo">
                     <table>
                         <thead>
                             <tr>
                                    <th>Patient Name</th>
                                 <th>Date</th>
                                 <th>Time</th>
                                    <th>Status</th>
                             </tr>
                         </thead>
                         <tbody>
                                {appointments
                                    .filter(app => app.status === 'completed')
                                    .sort((a, b) => {
                                        const dateA = new Date(`${a.date}T${a.time}`);
                                        const dateB = new Date(`${b.date}T${b.time}`);
                                        return dateB.getTime() - dateA.getTime(); // Sort by descending date
                                    })
                                    .map((appointment) => (
                                        <tr key={appointment.id}>
                                            <td>{appointment.patientName}</td>
                                            <td>{new Date(appointment.date).toLocaleDateString()}</td>
                                            <td>{appointment.time}</td>
                                            <td>
                                                <span className="status-tag completed">Completed</span>
                                     </td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 </div>
                )}
            </div>

            {/* Add Availability Modal */}
            {showAddModal && (
                <div className="modal-overlay">
                    <div className="modal-content neo-card">
                        <h3>Add Availability</h3>
                        <div className="modal-form">
                            <div className="form-group">
                                <label htmlFor="date-select">Select Date:</label>
                                <select 
                                    id="date-select"
                                    onChange={handleDateChange}
                                    value={selectedDate ? selectedDate.toISOString().split('T')[0] : ''}
                                    className="neo-input"
                                >
                                    <option value="">-- Select a date --</option>
                                    {generateDates().map((date) => (
                                        <option 
                                            key={date.toISOString()} 
                                            value={date.toISOString().split('T')[0]}
                                        >
                                            {date.toLocaleDateString('en-US', { 
                                                weekday: 'short', 
                                                month: 'short', 
                                                day: 'numeric' 
                                            })}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="form-group">
                                <label>Select Time Slots:</label>
                                <div className="time-slot-grid">
                                    {TIME_SLOTS.map((slot) => (
                                        <div 
                                            key={slot}
                                            className={`time-slot-item ${selectedTimeSlots.includes(slot) ? 'selected' : ''}`}
                                            onClick={() => handleTimeSlotToggle(slot)}
                                        >
                                            {slot}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="modal-actions">
                                <button 
                                    className="action-btn-neo secondary"
                                    onClick={() => setShowAddModal(false)}
                                >
                                    Cancel
                                </button>
                                <button 
                                    className="action-btn-neo primary"
                                    onClick={handleSaveAvailability}
                                    disabled={!selectedDate || selectedTimeSlots.length === 0}
                                >
                                    Save Availability
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AppointmentsView; 