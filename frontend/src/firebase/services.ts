import { auth, db } from './config';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  updateProfile
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  addDoc,
  orderBy,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';

// Auth services
export const registerUser = async (email: string, password: string, userData: any) => {
  try {
    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update profile with displayName
    if (userData.name) {
      console.log(`Setting displayName for user ${user.uid} to ${userData.name}`);
      await updateProfile(user, {
        displayName: userData.name
      });
    }
    
    // Ensure userType is included and valid
    if (!userData.userType || !['patient', 'doctor'].includes(userData.userType)) {
      throw new Error("Invalid user type. Must be 'patient' or 'doctor'");
    }
    
    try {
      // Save additional user data to Firestore
      await setDoc(doc(db, `users/${user.uid}`), {
        ...userData,
        email,
        uid: user.uid,
        createdAt: new Date()
      });
    } catch (firestoreError) {
      console.error("Error writing to Firestore:", firestoreError);
      // Even if Firestore write fails, return the user - Auth succeeded
      // We can handle profile data later if needed
      return user;
    }
    
    return user;
  } catch (error) {
    console.error("Error registering user:", error);
    throw error;
  }
};

export const loginUser = async (email: string, password: string, attemptedUserType: 'patient' | 'doctor') => {
  try {
    // Sign in with Firebase Authentication
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    try {
      // Get user data from Firestore to check userType
      const userData = await getUserData(user.uid);
      
      // If userData exists and has a userType, verify it matches the attempted type
      if (userData && userData.userType) {
        if (userData.userType !== attemptedUserType) {
          // If types don't match, sign the user out and throw an error
          await signOut(auth);
          throw new Error(`You are registered as a ${userData.userType}. Please login with the correct account type.`);
        }
      }
    } catch (firestoreError) {
      console.error("Error reading from Firestore during login:", firestoreError);
      // If we can't check the userType due to Firestore errors, just continue with login
      // The user will get redirected to the right place based on the selected login type
    }
    
    // Otherwise, this is a valid login
    return user;
  } catch (error) {
    console.error("Error logging in:", error);
    throw error;
  }
};

export const logoutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error logging out:", error);
    throw error;
  }
};

export const onAuthChanged = (callback: (user: FirebaseUser | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

export const getCurrentUser = () => {
  return auth.currentUser;
};

export const getUserData = async (userId: string) => {
  try {
    console.log(`Fetching user data for userId: ${userId}`);
    const userDoc = await getDoc(doc(db, `users/${userId}`));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      console.log(`User data successfully retrieved:`, userData);
      
      // Ensure userType exists and is valid
      if (!userData.userType || !['patient', 'doctor'].includes(userData.userType)) {
        console.warn(`User ${userId} has missing or invalid userType:`, userData.userType);
      }
      
      return userData;
    }
    
    console.warn(`No user document found for userId: ${userId}`);
    // Fallback to getting basic profile from Firebase Auth
    const currentUser = auth.currentUser;
    if (currentUser) {
      // If this user is the current user, use their display name
      if (currentUser.uid === userId && currentUser.displayName) {
        console.log(`Using displayName from Firebase Auth:`, currentUser.displayName);
        // Note: We don't know the user type here, so don't set it
        // This can cause problems with login validation, but the login function
        // already handles checking the userType against the attempted login type
        return {
          name: currentUser.displayName,
          email: currentUser.email
          // userType is intentionally NOT set here
        };
      } else if (currentUser.email) {
        console.log(`Using email only from Firebase Auth:`, currentUser.email);
        return {
          email: currentUser.email
          // userType is intentionally NOT set here
        };
      }
    }
    
    console.error(`No data available for userId: ${userId} in Firestore or Auth`);
    return null;
  } catch (error) {
    console.error("Error getting user data:", error);
    throw error;
  }
};

export const updateUserProfile = async (name: string) => {
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      await updateProfile(currentUser, {
        displayName: name
      });
      console.log(`Updated displayName for ${currentUser.uid} to ${name}`);
      
      // Also update in Firestore
      await updateDoc(doc(db, `users/${currentUser.uid}`), {
        name
      });
      
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error updating user profile:", error);
    throw error;
  }
};

// Doctor services
export const getDoctorDetails = async () => {
  try {
    const doctorsRef = collection(db, 'doctors');
    const querySnapshot = await getDocs(doctorsRef);
    
    const doctors: any[] = [];
    querySnapshot.forEach((doc) => {
      doctors.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return doctors;
  } catch (error) {
    console.error("Error getting doctor details:", error);
    throw error;
  }
};

export const getDoctorById = async (doctorId: string) => {
  try {
    const doctorDoc = await getDoc(doc(db, `doctors/${doctorId}`));
    if (doctorDoc.exists()) {
      return {
        id: doctorDoc.id,
        ...doctorDoc.data()
      };
    }
    return null;
  } catch (error) {
    console.error("Error getting doctor:", error);
    throw error;
  }
};

// Appointment services
export const bookAppointment = async (appointmentData: any) => {
  try {
    // Ensure all required fields are present
    const requiredFields = ['doctorId', 'patientId', 'patientName', 'time'];
    for (const field of requiredFields) {
      if (!appointmentData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Format date if present or use current date
    let appointmentDate = appointmentData.date || new Date();
    
    // If appointmentDate is a string, convert to Date object
    if (typeof appointmentDate === 'string') {
      appointmentDate = new Date(appointmentDate);
    }
    
    // Format the date for Firestore
    const formattedDate = formatDateForFirestore(appointmentDate);
    
    // Add appointment to appointments collection
    const appointmentRef = await addDoc(collection(db, 'appointments'), {
      ...appointmentData,
      date: appointmentDate,
      formattedDate: formattedDate,
      status: 'upcoming',
      createdAt: new Date()
    });
    
    // Update doctor's bookings
    const doctorRef = doc(db, `doctors/${appointmentData.doctorId}`);
    const doctorDoc = await getDoc(doctorRef);
    
    if (doctorDoc.exists()) {
      const bookings = doctorDoc.data().Bookings || [];
      const slots = doctorDoc.data().Slots_available || [];
      
      // Remove booked slot from available slots
      const updatedSlots = slots.filter((slot: string) => slot !== appointmentData.time);
      
      // Add to bookings
      const updatedBookings = [
        ...bookings,
        {
          id: appointmentRef.id,
          patient_name: appointmentData.patientName,
          patientId: appointmentData.patientId,
          time: appointmentData.time,
          date: formattedDate.iso
        }
      ];
      
      // Update the doctor document
      await updateDoc(doctorRef, {
        Slots_available: updatedSlots,
        Bookings: updatedBookings
      });
    } else {
      // If doctor document doesn't exist yet, create it
      await setDoc(doctorRef, {
        name: appointmentData.doctorName || '',
        email: appointmentData.doctorEmail || '',
        specialization: appointmentData.specialization || '',
        Slots_available: [],
        Bookings: [{
          id: appointmentRef.id,
          patient_name: appointmentData.patientName,
          patientId: appointmentData.patientId,
          time: appointmentData.time,
          date: formattedDate.iso
        }]
      });
    }
    
    return appointmentRef.id;
  } catch (error) {
    console.error("Error booking appointment:", error);
    throw error;
  }
};

export const getAppointmentsForDoctor = async (doctorId: string) => {
  try {
    const appointmentsRef = collection(db, 'appointments');
    const q = query(appointmentsRef, where("doctorId", "==", doctorId));
    const querySnapshot = await getDocs(q);
    
    const appointments: any[] = [];
    querySnapshot.forEach((doc) => {
      appointments.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return appointments;
  } catch (error) {
    console.error("Error getting appointments:", error);
    throw error;
  }
};

export const getAppointmentsForPatient = async (patientId: string) => {
  try {
    const appointmentsRef = collection(db, 'appointments');
    const q = query(appointmentsRef, where("patientId", "==", patientId));
    const querySnapshot = await getDocs(q);
    
    const appointments: any[] = [];
    querySnapshot.forEach((doc) => {
      appointments.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return appointments;
  } catch (error) {
    console.error("Error getting appointments:", error);
    throw error;
  }
};

// Check if an email is already registered as a different user type
export const checkEmailUserType = async (email: string, attemptedUserType: 'patient' | 'doctor') => {
  try {
    // Query the users collection for this email
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where("email", "==", email));
    const querySnapshot = await getDocs(q);
    
    // If no documents found, email is not registered
    if (querySnapshot.empty) {
      return { exists: false };
    }
    
    // Check user type of existing account
    const existingUser = querySnapshot.docs[0].data();
    if (existingUser.userType !== attemptedUserType) {
      return { 
        exists: true, 
        userType: existingUser.userType,
        mismatch: true 
      };
    }
    
    // Email exists with the same user type
    return { 
      exists: true, 
      userType: existingUser.userType,
      mismatch: false
    };
  } catch (error) {
    console.error("Error checking email user type:", error);
    throw error;
  }
};

// Get all patients from Firestore
export const getAllPatients = async () => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where("userType", "==", "patient"));
    const querySnapshot = await getDocs(q);
    
    const patients: any[] = [];
    querySnapshot.forEach((doc) => {
      patients.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return patients;
  } catch (error) {
    console.error("Error getting patients:", error);
    throw error;
  }
};

// Doctor availability services
export const getDoctorAvailability = async (doctorId: string) => {
  console.log(`[DEBUG] Starting getDoctorAvailability for doctorId: ${doctorId}`);
  
  if (!doctorId) {
    console.error("[DEBUG] getDoctorAvailability called with empty doctorId");
    return []; // Always return empty array, never throw
  }
  
  try {
    // First try to get from doctors collection
    console.log(`[DEBUG] Attempting to fetch from doctors/${doctorId}`);
    const doctorRef = doc(db, `doctors/${doctorId}`);
    
    let doctorDoc;
    try {
      doctorDoc = await getDoc(doctorRef);
    } catch (error) {
      console.error(`[DEBUG] Error getting doctor document: ${error}`);
      return []; // Return empty array on error
    }
    
    if (doctorDoc && doctorDoc.exists()) {
      try {
        const data = doctorDoc.data();
        const slots = data?.Slots_available || [];
        console.log(`[DEBUG] SUCCESS: Fetched ${slots.length} availability slots for doctor ${doctorId} from doctors collection`);
        return Array.isArray(slots) ? slots : []; // Ensure we return an array
      } catch (error) {
        console.error(`[DEBUG] Error parsing doctor data: ${error}`);
        return []; // Return empty array on data parsing error
      }
    } else {
      console.log(`[DEBUG] No doctor document found with ID ${doctorId} in doctors collection`);
      
      // Instead of continuing to search, let's create an empty doctor document
      try {
        console.log(`[DEBUG] Creating new doctor document for ID ${doctorId}`);
        await setDoc(doctorRef, {
          Slots_available: [],
          Bookings: [],
          lastUpdated: new Date()
        });
        console.log(`[DEBUG] Created empty doctor document for ID ${doctorId}`);
        return [];
      } catch (createErr) {
        console.error(`[DEBUG] Error creating doctor document: ${createErr}`);
        // Continue with trying users collection as fallback, but don't throw error
      }
    }
    
    // If not found in doctors collection, try users collection
    try {
      console.log(`[DEBUG] Attempting to fetch from users/${doctorId}`);
      const userRef = doc(db, `users/${doctorId}`);
      
      let userDoc;
      try {
        userDoc = await getDoc(userRef);
      } catch (error) {
        console.error(`[DEBUG] Error getting user document: ${error}`);
        return []; // Return empty array on error
      }
      
      if (userDoc && userDoc.exists()) {
        try {
          const userData = userDoc.data();
          if (userData.userType === 'doctor') {
            const slots = userData.Slots_available || [];
            console.log(`[DEBUG] SUCCESS: Fetched ${slots.length} availability slots for doctor ${doctorId} from users collection`);
            return Array.isArray(slots) ? slots : []; // Ensure we return an array
          } else {
            console.log(`[DEBUG] User document exists for ${doctorId} but userType is not 'doctor'`);
          }
        } catch (error) {
          console.error(`[DEBUG] Error parsing user data: ${error}`);
          return []; // Return empty array on data parsing error
        }
      } else {
        console.log(`[DEBUG] No user document found with ID ${doctorId}`);
      }
    } catch (userError) {
      console.error(`[DEBUG] Error accessing users collection: ${userError}`);
      // Continue with returning empty array, don't throw error
    }
    
    console.log(`[DEBUG] No availability data found for doctor ${doctorId} in any collection, returning empty array`);
    return [];
  } catch (error) {
    console.error("[DEBUG] Error getting doctor availability:", error);
    // Return empty array instead of throwing error
    console.log("[DEBUG] Returning empty array due to error");
    return [];
  }
};

export const addDoctorAvailability = async (doctorId: string, slots: string[]) => {
  try {
    console.log(`Adding availability slots for doctor ${doctorId}:`, slots);
    
    // First check the doctors collection
    const doctorRef = doc(db, `doctors/${doctorId}`);
    const doctorDoc = await getDoc(doctorRef);
    
    let currentSlots: string[] = [];
    let userId: string | null = null;
    
    if (doctorDoc.exists()) {
      currentSlots = doctorDoc.data().Slots_available || [];
      userId = doctorDoc.data().userId || null;
      
      // Merge the new slots with existing slots, removing duplicates
      const updatedSlots = [...new Set([...currentSlots, ...slots])];
      
      console.log(`Updating doctor ${doctorId} with ${updatedSlots.length} slots (added ${slots.length} new slots)`);
      
      // Update the doctor document
      await updateDoc(doctorRef, {
        Slots_available: updatedSlots,
        lastUpdated: new Date()
      });
      
      // If this doctor has a userId, also update the user record
      if (userId) {
        try {
          console.log(`Syncing availability to user record ${userId}`);
          const userRef = doc(db, `users/${userId}`);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists()) {
            await updateDoc(userRef, {
              Slots_available: updatedSlots
            });
            console.log(`Successfully updated user record ${userId} with ${updatedSlots.length} slots`);
          }
        } catch (userError) {
          console.error(`Error updating user record for doctor ${doctorId}:`, userError);
          // Continue even if user update fails
        }
      }
      
      return updatedSlots;
    } else {
      // If the doctor record doesn't exist, check if the ID is a user ID
      const userRef = doc(db, `users/${doctorId}`);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists() && userDoc.data().userType === 'doctor') {
        // It's a user document - update it directly
        const userData = userDoc.data();
        currentSlots = userData.Slots_available || [];
        
        // Merge the new slots with existing slots
        const updatedSlots = [...new Set([...currentSlots, ...slots])];
        
        // Update the user document
        await updateDoc(userRef, {
          Slots_available: updatedSlots
        });
        
        console.log(`Updated user-doctor ${doctorId} with ${updatedSlots.length} slots`);
        
        // Create or update a corresponding doctor document
        await setDoc(doctorRef, {
          name: userData.fullName || userData.name || '',
          email: userData.email || '',
          specialization: userData.specialization || '',
          Slots_available: updatedSlots,
          Bookings: userData.Bookings || [],
          userId: doctorId, // Link back to the user document
          userType: 'doctor',
          lastUpdated: new Date()
        });
        
        console.log(`Created/updated doctor record for user ${doctorId}`);
        
        return updatedSlots;
      } else {
        throw new Error(`Doctor not found with ID ${doctorId}`);
      }
    }
  } catch (error) {
    console.error("Error adding doctor availability:", error);
    throw error;
  }
};

export const removeDoctorAvailability = async (doctorId: string, slot: string) => {
  try {
    console.log(`Removing availability slot for doctor ${doctorId}:`, slot);
    
    // First check the doctors collection
    const doctorRef = doc(db, `doctors/${doctorId}`);
    const doctorDoc = await getDoc(doctorRef);
    
    if (doctorDoc.exists()) {
      const doctorData = doctorDoc.data();
      const currentSlots = doctorData.Slots_available || [];
      const userId = doctorData.userId || null;
      
      // Remove the slot
      const updatedSlots = currentSlots.filter((s: string) => s !== slot);
      
      console.log(`Updating doctor ${doctorId}: removing slot ${slot}, ${updatedSlots.length} slots remaining`);
      
      // Update the doctor document
      await updateDoc(doctorRef, {
        Slots_available: updatedSlots,
        lastUpdated: new Date()
      });
      
      // If this doctor has a userId, also update the user record
      if (userId) {
        try {
          console.log(`Syncing removed slot to user record ${userId}`);
          const userRef = doc(db, `users/${userId}`);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists()) {
            await updateDoc(userRef, {
              Slots_available: updatedSlots
            });
            console.log(`Successfully updated user record ${userId} with ${updatedSlots.length} slots`);
          }
        } catch (userError) {
          console.error(`Error updating user record for doctor ${doctorId}:`, userError);
          // Continue even if user update fails
        }
      }
      
      return updatedSlots;
    } else {
      // Check if the doctorId is actually a userId
      const userRef = doc(db, `users/${doctorId}`);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists() && userDoc.data().userType === 'doctor') {
        const userData = userDoc.data();
        const currentSlots = userData.Slots_available || [];
        
        // Remove the slot
        const updatedSlots = currentSlots.filter((s: string) => s !== slot);
        
        // Update the user document
        await updateDoc(userRef, {
          Slots_available: updatedSlots
        });
        
        console.log(`Updated user-doctor ${doctorId} with ${updatedSlots.length} slots after removing ${slot}`);
        
        // Create/update corresponding doctor document
        await setDoc(doctorRef, {
          name: userData.fullName || userData.name || '',
          email: userData.email || '',
          specialization: userData.specialization || '',
          Slots_available: updatedSlots,
          Bookings: userData.Bookings || [],
          userId: doctorId,
          userType: 'doctor',
          lastUpdated: new Date()
        });
        
        console.log(`Created/updated doctor record for user ${doctorId}`);
        
        return updatedSlots;
      }
      
      console.warn(`No doctor found with ID ${doctorId} to remove slot`);
      return [];
    }
  } catch (error) {
    console.error("Error removing doctor availability:", error);
    throw error;
  }
};

// Format date objects for appointments
export const formatDateForFirestore = (date: Date) => {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1, // JavaScript months are 0-based
    day: date.getDate(),
    iso: date.toISOString().split('T')[0] // YYYY-MM-DD format
  };
};

// Update appointment status (mark as completed or cancelled)
export const updateAppointmentStatus = async (appointmentId: string, status: 'upcoming' | 'completed' | 'cancelled') => {
  try {
    console.log(`Updating appointment ${appointmentId} status to ${status}`);
    
    // Update the appointment document
    const appointmentRef = doc(db, `appointments/${appointmentId}`);
    await updateDoc(appointmentRef, {
      status: status,
      updatedAt: new Date()
    });
    
    // Get the appointment details to update doctor's bookings
    const appointmentDoc = await getDoc(appointmentRef);
    
    if (appointmentDoc.exists()) {
      const appointmentData = appointmentDoc.data();
      const doctorId = appointmentData.doctorId;
      
      // If the appointment is completed or cancelled, update the doctor's bookings
      if (status === 'completed' || status === 'cancelled') {
        const doctorRef = doc(db, `doctors/${doctorId}`);
        const doctorDoc = await getDoc(doctorRef);
        
        if (doctorDoc.exists()) {
          const bookings = doctorDoc.data().Bookings || [];
          
          // Update the booking status in the doctor's bookings array
          const updatedBookings = bookings.map((booking: any) => {
            if (booking.id === appointmentId) {
              return {
                ...booking,
                status: status
              };
            }
            return booking;
          });
          
          // Update the doctor document
          await updateDoc(doctorRef, {
            Bookings: updatedBookings
          });
          
          console.log(`Updated doctor ${doctorId} bookings for appointment ${appointmentId}`);
        }
        
        // Also update in the users collection if there's a link
        try {
          if (doctorDoc.exists() && doctorDoc.data().userId) {
            const userId = doctorDoc.data().userId;
            const userRef = doc(db, `users/${userId}`);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists() && userDoc.data().Bookings) {
              const userBookings = userDoc.data().Bookings || [];
              
              // Update the booking status in the user's bookings array
              const updatedUserBookings = userBookings.map((booking: any) => {
                if (booking.id === appointmentId) {
                  return {
                    ...booking,
                    status: status
                  };
              }
              return booking;
              });
              
              // Update the user document
              await updateDoc(userRef, {
                Bookings: updatedUserBookings
              });
              
              console.log(`Updated user ${userId} bookings for appointment ${appointmentId}`);
            }
          }
        } catch (userError) {
          console.error(`Error updating user bookings for appointment ${appointmentId}:`, userError);
          // Continue even if user update fails
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error("Error updating appointment status:", error);
    throw error;
  }
};

// CHAT SESSION SERVICES
export const createChatSession = async (userId: string) => {
  try {
    console.log("Creating new chat session for userId:", userId);
    
    // Create a new document in the chat_sessions collection
    const chatSessionsRef = collection(db, 'chat_sessions');
    const newSessionRef = await addDoc(chatSessionsRef, {
      userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      messages: [] // Initialize with empty messages array
    });
    
    console.log("Created new chat session with ID:", newSessionRef.id);
    return newSessionRef.id;
  } catch (error) {
    console.error("Error creating chat session:", error);
    throw error;
  }
};

export const getChatSessionsForUser = async (userId: string) => {
  try {
    console.log("Getting chat sessions for userId:", userId);
    
    const chatSessionsRef = collection(db, 'chat_sessions');
    const q = query(
      chatSessionsRef, 
      where("userId", "==", userId),
      orderBy("updatedAt", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const sessions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log("Found", sessions.length, "chat sessions");
    return sessions;
  } catch (error) {
    console.error("Error getting chat sessions:", error);
    throw error;
  }
};

export const getChatSessionById = async (sessionId: string) => {
  try {
    console.log("Getting chat session by ID:", sessionId);
    
    const sessionRef = doc(db, 'chat_sessions', sessionId);
    const docSnap = await getDoc(sessionRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log("Chat session found:", data);
      return {
        id: docSnap.id,
        ...data
      };
    } else {
      console.log("No chat session found with ID:", sessionId);
      return null;
    }
  } catch (error) {
    console.error("Error getting chat session:", error);
    throw error;
  }
};

export const updateChatSessionMessages = async (sessionId: string, messages: any[]) => {
  try {
    console.log("Updating messages for chat session:", sessionId, "Message count:", messages.length);
    
    // Process messages to ensure Firestore compatibility
    const processedMessages = messages.map(msg => {
      // Create a copy to avoid mutating the original message
      const processedMsg = {...msg};
      
      // Convert Date objects to Firestore timestamps
      if (msg.timestamp instanceof Date) {
        // Return the ISO string representation that Firestore can store
        processedMsg.timestamp = msg.timestamp.toISOString();
      } else if (typeof msg.timestamp === 'string') {
        // Already a string (likely ISO format), keep as is
        processedMsg.timestamp = msg.timestamp;
      } else {
        // Fallback to current time if timestamp is invalid
        processedMsg.timestamp = new Date().toISOString();
      }
      
      return processedMsg;
    });
    
    const sessionRef = doc(db, 'chat_sessions', sessionId);
    
    // Update the document with new messages and update timestamp
    await updateDoc(sessionRef, {
      messages: processedMessages,
      updatedAt: serverTimestamp()
    });
    
    console.log("Successfully updated chat session messages");
    return true;
  } catch (error) {
    console.error("Error updating chat session messages:", error);
    throw error;
  }
};

// Delete a chat session
export const deleteChatSession = async (sessionId: string) => {
  try {
    console.log("Deleting chat session:", sessionId);
    
    const sessionRef = doc(db, 'chat_sessions', sessionId);
    await deleteDoc(sessionRef);
    
    console.log("Successfully deleted chat session");
    return true;
  } catch (error) {
    console.error("Error deleting chat session:", error);
    throw error;
  }
};

// Force create doctor document if it doesn't exist
export const ensureDoctorDocument = async (doctorId: string, doctorData: any) => {
  if (!doctorId) {
    console.error("[DEBUG] ensureDoctorDocument called with empty doctorId");
    return false;
  }
  
  try {
    console.log(`[DEBUG] Checking if doctor document exists for ${doctorId}`);
    const doctorRef = doc(db, `doctors/${doctorId}`);
    const doctorDoc = await getDoc(doctorRef);
    
    if (doctorDoc.exists()) {
      console.log(`[DEBUG] Doctor document already exists for ${doctorId}`);
      return true;
    }
    
    // Document doesn't exist, create it
    console.log(`[DEBUG] Creating doctor document for ${doctorId}`);
    
    // Get user data if available
    const userRef = doc(db, `users/${doctorId}`);
    const userDoc = await getDoc(userRef);
    let userData = {};
    
    if (userDoc.exists()) {
      userData = userDoc.data();
      console.log(`[DEBUG] Found user data for ${doctorId}`);
    }
    
    // Merge with provided doctor data
    const mergedData = {
      ...userData,
      ...doctorData,
      userId: doctorId,
      userType: 'doctor',
      Slots_available: [],
      Bookings: [],
      lastUpdated: new Date()
    };
    
    // Create the doctor document
    await setDoc(doctorRef, mergedData);
    console.log(`[DEBUG] Successfully created doctor document for ${doctorId}`);
    return true;
  } catch (error) {
    console.error(`[DEBUG] Error ensuring doctor document: ${error}`);
    return false;
  }
};

// Repair doctor document if it exists but is missing required fields
export const repairDoctorDocument = async (doctorId: string, doctorData: any) => {
  if (!doctorId) {
    console.error("[DEBUG] repairDoctorDocument called with empty doctorId");
    return false;
  }
  
  try {
    console.log(`[DEBUG] Checking doctor document for ${doctorId} for repair`);
    const doctorRef = doc(db, `doctors/${doctorId}`);
    const doctorDoc = await getDoc(doctorRef);
    
    if (!doctorDoc.exists()) {
      console.log(`[DEBUG] Doctor document doesn't exist for ${doctorId}, nothing to repair`);
      return false;
    }
    
    const data = doctorDoc.data();
    let needsRepair = false;
    
    // Check for missing fields
    if (!data.Slots_available) {
      console.log(`[DEBUG] Doctor document missing Slots_available field`);
      needsRepair = true;
    }
    
    if (!needsRepair) {
      console.log(`[DEBUG] Doctor document for ${doctorId} doesn't need repair`);
      return true;
    }
    
    // Repair the document
    console.log(`[DEBUG] Repairing doctor document for ${doctorId}`);
    
    // Merge with existing data
    const repairData = {
      ...data,
      ...doctorData,
      Slots_available: data.Slots_available || [],
      Bookings: data.Bookings || [],
      lastUpdated: new Date()
    };
    
    // Update the doctor document
    await updateDoc(doctorRef, repairData);
    console.log(`[DEBUG] Successfully repaired doctor document for ${doctorId}`);
    return true;
  } catch (error) {
    console.error(`[DEBUG] Error repairing doctor document: ${error}`);
    return false;
  }
};

/**
 * Automatically cleans up expired time slots for a doctor by comparing with the current date.
 * This function will analyze all available slots and remove those that have passed.
 * 
 * @param doctorId The ID of the doctor whose slots need to be cleaned
 * @returns An object with count of removed slots and success status
 */
export const cleanupExpiredTimeSlots = async (doctorId: string) => {
  if (!doctorId) {
    console.error("cleanupExpiredTimeSlots called with empty doctorId");
    return { success: false, removedCount: 0, error: "Empty doctorId provided" };
  }
  
  try {
    console.log(`Cleaning up expired time slots for doctor: ${doctorId}`);
    
    // Get the current date and time
    const now = new Date();
    
    // Get all available slots for the doctor
    let availableSlots;
    try {
      availableSlots = await getDoctorAvailability(doctorId);
      // Ensure we have an array even if getDoctorAvailability fails somehow
      if (!Array.isArray(availableSlots)) {
        console.warn(`Non-array returned from getDoctorAvailability for doctor: ${doctorId}`);
        availableSlots = [];
      }
    } catch (error) {
      console.error(`Error getting available slots for doctor ${doctorId}:`, error);
      return { success: false, removedCount: 0, error: "Failed to retrieve slots" };
    }
    
    if (availableSlots.length === 0) {
      console.log(`No available slots found for doctor: ${doctorId}, nothing to clean up`);
      return { success: true, removedCount: 0 };
    }
    
    // Find slots that are in the past
    const expiredSlots = availableSlots.filter(slot => {
      try {
        // Skip any invalid slot format
        if (!slot || typeof slot !== 'string') return false;
        
        // Parse the slot format (YYYY-MM-DD-HH:MM)
        const parts = slot.split('-');
        if (parts.length < 4) return false;
        
        // Create date object from slot
        const slotDate = new Date(
          parseInt(parts[0]),     // Year
          parseInt(parts[1]) - 1, // Month (0-indexed)
          parseInt(parts[2]),     // Day
          parseInt(parts[3].split(':')[0]),     // Hour
          parseInt(parts[3].split(':')[1] || '0')  // Minute
        );
        
        // Check if slot is in the past
        return !isNaN(slotDate.getTime()) && slotDate < now;
      } catch (err) {
        console.warn(`Error parsing slot: ${slot}, skipping it`, err);
        return false;
      }
    });
    
    console.log(`Found ${expiredSlots.length} expired slots out of ${availableSlots.length} total slots`);
    
    if (expiredSlots.length === 0) {
      return { success: true, removedCount: 0 };
    }
    
    try {
      // Get the doctor document
      const doctorRef = doc(db, `doctors/${doctorId}`);
      const doctorSnap = await getDoc(doctorRef);
      
      if (!doctorSnap.exists()) {
        console.error(`Doctor document not found: ${doctorId}`);
        return { success: false, removedCount: 0, error: 'Doctor document not found' };
      }
      
      // Get the current available slots
      const doctorData = doctorSnap.data();
      const currentSlots = doctorData.Slots_available || [];
      
      // Ensure currentSlots is an array
      if (!Array.isArray(currentSlots)) {
        console.warn(`Current slots is not an array for doctor: ${doctorId}`);
        return { success: false, removedCount: 0, error: 'Current slots is not an array' };
      }
      
      // Filter out expired slots
      const updatedSlots = currentSlots.filter((slot: string) => !expiredSlots.includes(slot));
      
      // Update the doctor document with the new slots
      await updateDoc(doctorRef, {
        'Slots_available': updatedSlots,
        'lastUpdated': serverTimestamp()
      });
      
      console.log(`Successfully removed ${expiredSlots.length} expired slots for doctor: ${doctorId}`);
      return { success: true, removedCount: expiredSlots.length };
    } catch (error) {
      console.error("Error updating doctor document:", error);
      return { success: false, removedCount: 0, error };
    }
  } catch (error) {
    console.error("Error cleaning up expired time slots:", error);
    return { success: false, removedCount: 0, error };
  }
}; 