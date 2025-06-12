import os
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from .firebase_config import db, firebase_initialized, initialize_firebase, get_firestore_client

# No more legacy file path reference

class Appointment:

    @staticmethod
    def force_firebase_initialization():
        """
        Attempt to initialize Firebase if it's not already initialized.
        Returns True if Firebase is initialized after the call, False otherwise.
        """
        global db, firebase_initialized
        
        if not firebase_initialized:
            print("Firebase not initialized, attempting to initialize...")
            firebase_initialized = initialize_firebase()
            if firebase_initialized:
                db = get_firestore_client()
                print(f"Firebase initialization successful: {firebase_initialized}")
                print(f"Firestore DB available: {db is not None}")
            else:
                print("Firebase initialization failed.")
        
        return firebase_initialized and db is not None

    @staticmethod
    def load_doctor_details() -> List[Dict[str, Any]]:
        """
        Loads doctor details from the doctors collection in Firestore.
        This collection stores all doctors including those registered as users.

        Returns:
            list: A list of dictionaries, where each dictionary represents a doctor
                  with their details, available slots, and bookings.
        """
        print("======== LOADING DOCTOR DETAILS ========")
        print(f"Firebase initialized: {firebase_initialized}")
        print(f"Firestore DB available: {db is not None}")
        
        # Ensure Firebase is initialized
        Appointment.force_firebase_initialization()
        
        # Load from doctors collection first
        if firebase_initialized and db:
            try:
                # Get all doctors from doctors collection
                doctors_ref = db.collection('doctors')
                doctors = []
                
                for doc in doctors_ref.stream():
                    doctor_data = doc.to_dict()
                    doctor_data['id'] = doc.id  # Add document ID
                    
                    # Default empty slots and bookings if not present
                    if 'Slots_available' not in doctor_data:
                        doctor_data['Slots_available'] = []
                    if 'Bookings' not in doctor_data:
                        doctor_data['Bookings'] = []
                    
                    doctors.append(doctor_data)
                
                print(f"SUCCESS: Loaded {len(doctors)} doctors from doctors collection")
                if doctors:
                    for idx, doctor in enumerate(doctors):
                        print(f"  Doctor #{idx+1}: {doctor.get('name', 'Unknown')} - Email: {doctor.get('email', 'No email')} - {len(doctor.get('Slots_available', []))} slots available")
                        
                return doctors
            except Exception as e:
                print(f"ERROR loading doctors from Firestore: {str(e)}")
                return []
        else:
            print("ERROR: Firebase not initialized or DB not available. Cannot load doctor details.")
            return []

    @staticmethod
    def save_doctor_details(doctors_data: List[Dict[str, Any]]) -> bool:
        """
        Saves the updated doctor details to the doctors collection in Firestore.
        If the doctor has a corresponding user record, it also updates that record.

        Args:
            doctors_data (list): The list of doctor dictionaries to save.

        Returns:
            bool: True if the save operation was successful, False otherwise.
        """
        if not firebase_initialized or not db:
            print("Firebase not initialized. Cannot save doctor details.")
            return False
            
        try:
            # For each doctor in the list
            for doctor in doctors_data:
                doctor_id = doctor.get('id')
                
                if not doctor_id:
                    print(f"Warning: Doctor has no ID, cannot save: {doctor.get('name', 'Unknown')}")
                    continue
                
                # Make a copy without the id field
                doctor_copy = doctor.copy()
                doctor_copy.pop('id', None)
                
                # Update the doctor record in the doctors collection
                print(f"Saving doctor {doctor.get('name', 'Unknown')} to doctors collection")
                db.collection('doctors').document(doctor_id).update({
                    'Slots_available': doctor_copy.get('Slots_available', []),
                    'Bookings': doctor_copy.get('Bookings', []),
                    'lastUpdated': datetime.now()
                })
                
                # If this doctor has a userId, also update the user record
                user_id = doctor.get('userId')
                if user_id:
                    print(f"Synchronizing with user record {user_id}")
                    try:
                        # Verify user exists
                        user_ref = db.collection('users').document(user_id)
                        user_doc = user_ref.get()
                        
                        if user_doc.exists:
                            # Update user record with availability and bookings
                            user_ref.update({
                                'Slots_available': doctor_copy.get('Slots_available', []),
                                'Bookings': doctor_copy.get('Bookings', [])
                            })
                            print(f"Successfully updated user record {user_id}")
                        else:
                            print(f"User {user_id} not found, skipping sync")
                    except Exception as e:
                        print(f"Error updating user record: {e}")
                    
            return True
        except Exception as e:
            print(f"Error saving to Firestore: {e}")
            return False

    @staticmethod
    def book_appointment(patient_name: str, time: str, doctor_name: str, specialization: str = None) -> bool:
        """
        Books an appointment for a patient with a specific doctor at a given time,
        removes the booked slot, and updates the 'Bookings' in the doctors collection.
        Also syncs changes with the user record if applicable.

        Args:
            patient_name (str): The name of the patient booking.
            time (str): The desired time slot.
            doctor_name (str): The name of the doctor.
            specialization (str, optional): The specialization of the doctor. Defaults to None.

        Returns:
            bool: True if booking was successful, False otherwise.
        """
        # Check if Firebase is initialized
        if not firebase_initialized or not db:
            print("Firebase not initialized. Cannot book appointment.")
            return False
            
        # Load doctor details from Firestore
        doctors_data = Appointment.load_doctor_details()
        if not doctors_data:
            print("No doctor data available in Firestore.")
            return False

        # Find the doctor by name
        found_doctor_index = -1
        found_doctor_id = None
        found_doctor_email = None
        found_user_id = None

        for i, doctor in enumerate(doctors_data):
            # Check for name match - could be either name or fullName field
            doctor_name_value = doctor.get('name', doctor.get('fullName', ''))
            
            # Try to match either exact name or "Dr. " prefix version
            if doctor_name_value == doctor_name or doctor_name_value == f"Dr. {doctor_name}" or doctor_name_value == doctor_name.replace("Dr. ", ""):
                found_doctor_index = i
                found_doctor_id = doctor.get('id')
                found_doctor_email = doctor.get('email')
                found_user_id = doctor.get('userId')
                break

        if found_doctor_index == -1:
            print(f"Error: Doctor '{doctor_name}' not found in Firestore.")
            return False

        found_doctor = doctors_data[found_doctor_index]
        
        # First, convert the time parameter to a consistent format
        original_time = time  # Store original time parameter for reference
        
        # Parse the time slot format
        is_legacy_format = '-' not in time
        is_display_format = ' at ' in time
        
        # Conversion logic to handle time formats
        if is_display_format:
            # Already in the display format "YYYY-MM-DD at HH:MM"
            parts = time.split(' at ')
            if len(parts) != 2:
                print(f"Error: Invalid time format '{time}'. Expected 'YYYY-MM-DD at HH:MM'.")
                return False
            date_part = parts[0]
            time_part = parts[1]
            slot_in_system_format = f"{date_part}-{time_part}"
        elif is_legacy_format:
            # Legacy format (just time like "16:00" without date)
            today = datetime.now().strftime("%Y-%m-%d")
            slot_in_system_format = f"{today}-{time}"
        else:
            # Already in system format "YYYY-MM-DD-HH:MM"
            slot_in_system_format = time
            
        print(f"Booking slot in system format: {slot_in_system_format}")
            
        # Now check if this slot is available
        if 'Slots_available' not in found_doctor:
            print(f"Error: Doctor '{doctor_name}' has no available slots.")
            return False
            
        # Check all available slots, handling different formats
        slot_found = False
        slot_to_remove = None
        
        for available_slot in found_doctor['Slots_available']:
            # Check if slot is a datetime object (DatetimeWithNanoseconds from Firestore)
            if hasattr(available_slot, 'strftime'):
                # Parse the parameter time into components
                try:
                    if is_display_format:
                        # Parse from "YYYY-MM-DD at HH:MM"
                        parts = time.split(' at ')
                        slot_date = datetime.strptime(parts[0], "%Y-%m-%d").date()
                        slot_time = datetime.strptime(parts[1], "%H:%M").time()
                    elif is_legacy_format:
                        # For legacy format, assume today's date
                        slot_date = datetime.now().date()
                        slot_time = datetime.strptime(time, "%H:%M").time()
                    else:
                        # Parse from "YYYY-MM-DD-HH:MM"
                        parts = time.split('-')
                        date_str = f"{parts[0]}-{parts[1]}-{parts[2]}"
                        time_str = parts[3]
                        slot_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                        slot_time = datetime.strptime(time_str, "%H:%M").time()
                        
                    # Compare with the datetime slot
                    available_date = available_slot.date()
                    available_time = available_slot.time()
                    
                    if slot_date == available_date and slot_time == available_time:
                        slot_found = True
                        slot_to_remove = available_slot
                        break
                except (ValueError, IndexError) as e:
                    print(f"Error parsing time format: {e}")
                    continue
                    
            # Check if string-based slot matches our system format
            elif isinstance(available_slot, str) and available_slot == slot_in_system_format:
                slot_found = True
                slot_to_remove = available_slot
                break
                
            # Handle legacy format slots or partial matches
            elif isinstance(available_slot, str):
                # Try split on '-' for system format matching
                if '-' in available_slot and '-' in slot_in_system_format:
                    try:
                        avail_parts = available_slot.split('-')
                        slot_parts = slot_in_system_format.split('-')
                        
                        # Compare date parts and time parts
                        if len(avail_parts) >= 4 and len(slot_parts) >= 4:
                            avail_date = f"{avail_parts[0]}-{avail_parts[1]}-{avail_parts[2]}"
                            avail_time = avail_parts[3]
                            slot_date = f"{slot_parts[0]}-{slot_parts[1]}-{slot_parts[2]}"
                            slot_time = slot_parts[3]
                            
                            if avail_date == slot_date and avail_time == slot_time:
                                slot_found = True
                                slot_to_remove = available_slot
                                break
                    except (ValueError, IndexError):
                        continue
                
                # For legacy time-only slots
                elif is_legacy_format and time == available_slot:
                    slot_found = True
                    slot_to_remove = available_slot
                    break
        
        if not slot_found:
            print(f"Error: Slot '{time}' not available for Doctor '{doctor_name}'.")
            for avail in found_doctor['Slots_available']:
                print(f"  Available: {avail}")
            return False
            
        # Check specialization if provided
        if specialization is not None and 'specialization' in found_doctor and specialization != found_doctor['specialization']:
            print(f"Error: Doctor '{doctor_name}' with specialization '{specialization}' not found.")
            return False

        # Remove the booked slot
        doctors_data[found_doctor_index]['Slots_available'].remove(slot_to_remove)

        # Update Bookings in doctor_details
        if 'Bookings' not in doctors_data[found_doctor_index]:
            doctors_data[found_doctor_index]['Bookings'] = []
        
        # Create booking info
        booking_info = {'patient_name': patient_name, 'time': time}
        
        # Store the original time input format for reference
        original_time = time
        
        # If it's the display format, parse date information
        if is_display_format:
            parts = time.split(' at ')
            if len(parts) == 2:
                date_str = parts[0]
                time_str = parts[1]
                booking_info['date'] = date_str
                booking_info['time'] = time_str
        # If it's the new format, parse date information
        elif not is_legacy_format:
            parts = time.split('-')
            if len(parts) >= 4:
                # Format is YYYY-MM-DD-HH:MM
                date_str = f"{parts[0]}-{parts[1]}-{parts[2]}"
                time_str = parts[3]
                booking_info['date'] = date_str
                booking_info['time'] = time_str
        
        doctors_data[found_doctor_index]['Bookings'].append(booking_info)

        # Create an appointment document in Firestore
        try:
            from firebase_admin import firestore as admin_firestore
            
            # Parse the date from the time slot if new format
            appointment_date = None
            appointment_time = time
            
            if is_display_format:
                parts = time.split(' at ')
                if len(parts) == 2:
                    date_str = parts[0]
                    time_str = parts[1]
                    
                    try:
                        appointment_date = datetime.strptime(date_str, "%Y-%m-%d")
                        appointment_time = time_str
                    except ValueError:
                        print(f"Error parsing date: {date_str}")
            elif not is_legacy_format:
                parts = time.split('-')
                if len(parts) >= 4:
                    # Format is YYYY-MM-DD-HH:MM
                    date_str = f"{parts[0]}-{parts[1]}-{parts[2]}"
                    time_str = parts[3]
                    
                    try:
                        appointment_date = datetime.strptime(date_str, "%Y-%m-%d")
                        appointment_time = time_str
                    except ValueError:
                        print(f"Error parsing date: {date_str}")
            
            # Create formatted date for Firestore
            formatted_date = None
            if appointment_date:
                formatted_date = {
                    'year': appointment_date.year,
                    'month': appointment_date.month,
                    'day': appointment_date.day,
                    'iso': appointment_date.strftime("%Y-%m-%d")
                }
            
            # Create patient_id as 'unknown' for now - in a real app, this would be the user ID
            patient_id = 'unknown'
            
            appointment_data = {
                'patientName': patient_name,
                'patientId': patient_id,
                'doctorName': found_doctor.get('name', found_doctor.get('fullName', doctor_name)),
                'doctorId': found_doctor_id or '',
                'doctorEmail': found_doctor_email or '',
                'userId': found_user_id,  # Reference to the user document if exists
                'time': appointment_time,
                'date': appointment_date,
                'formattedDate': formatted_date,
                'status': 'upcoming',
                'createdAt': admin_firestore.SERVER_TIMESTAMP,
                'lastUpdated': datetime.now()
            }
            
            # Add the appointment to Firestore
            appointment_ref = db.collection('appointments').add(appointment_data)
            print(f"Created appointment document with ID: {appointment_ref[1].id}")
            
            # Update the corresponding user record if available
            if found_user_id:
                try:
                    user_ref = db.collection('users').document(found_user_id)
                    user_doc = user_ref.get()
                    
                    if user_doc.exists:
                        user_data = user_doc.to_dict()
                        
                        # Update user's slots and bookings
                        user_slots = user_data.get('Slots_available', [])
                        if slot_to_remove in user_slots:
                            user_slots.remove(slot_to_remove)
                            
                        user_bookings = user_data.get('Bookings', [])
                        user_bookings.append(booking_info)
                        
                        user_ref.update({
                            'Slots_available': user_slots,
                            'Bookings': user_bookings
                        })
                        print(f"Updated user record {found_user_id} with new booking")
                except Exception as e:
                    print(f"Error updating user record: {e}")
            
        except Exception as e:
            print(f"Error creating appointment in Firestore: {e}")
            return False

        # Save the updated doctor details
        if not Appointment.save_doctor_details(doctors_data):
            print("Error: Could not update doctor details after booking.")
            return False

        print(f"Booking done for {patient_name} with {doctor_name} at {time}.")
        return True

    @staticmethod
    def add_doctor_availability(doctor_id: str, date_str: str, time_slots: List[str]) -> bool:
        """
        Adds availability time slots for a specific doctor in the doctors collection.

        Args:
            doctor_id (str): The Firestore document ID of the doctor in the doctors collection.
            date_str (str): The date in YYYY-MM-DD format.
            time_slots (List[str]): List of time slots in HH:MM format.

        Returns:
            bool: True if successful, False otherwise.
        """
        if not firebase_initialized or not db:
            print("Firebase not initialized. Cannot add doctor availability.")
            return False
            
        try:
            # Load the doctor document from the doctors collection
            doctor_doc = db.collection('doctors').document(doctor_id).get()
            
            if not doctor_doc.exists:
                print(f"Doctor with ID {doctor_id} not found in doctors collection.")
                return False
            
            # Get current data
            doctor_data = doctor_doc.to_dict()
            if not doctor_data:
                print(f"Doctor with ID {doctor_id} has no data.")
                return False
                
            # Initialize Slots_available if it doesn't exist
            if 'Slots_available' not in doctor_data:
                doctor_data['Slots_available'] = []
                
            # Format the new slots with date (YYYY-MM-DD-HH:MM)
            new_slots = [f"{date_str}-{time_slot}" for time_slot in time_slots]
            
            # Check for duplicates and add only unique slots
            existing_slots = set(doctor_data['Slots_available'])
            slots_to_add = [slot for slot in new_slots if slot not in existing_slots]
            
            if not slots_to_add:
                print("No new slots to add. All slots already exist.")
                return True  # Still consider it successful
                
            # Add the new slots
            doctor_data['Slots_available'].extend(slots_to_add)
            
            # Update the doctor document
            db.collection('doctors').document(doctor_id).update({
                'Slots_available': doctor_data['Slots_available'],
                'lastUpdated': datetime.now()
            })
            
            # If doctor has a userId, also update user record
            user_id = doctor_data.get('userId')
            if user_id:
                try:
                    user_ref = db.collection('users').document(user_id)
                    user_doc = user_ref.get()
                    
                    if user_doc.exists:
                        user_ref.update({
                            'Slots_available': doctor_data['Slots_available']
                        })
                        print(f"Also updated user record {user_id} with new availability")
                except Exception as e:
                    print(f"Error updating user record: {e}")
            
            print(f"Successfully added {len(slots_to_add)} new availability slots for doctor {doctor_id}")
            return True
            
        except Exception as e:
            print(f"Error adding doctor availability: {e}")
            return False
            
    @staticmethod
    def remove_doctor_availability(doctor_id: str, slot: str) -> bool:
        """
        Removes an availability time slot for a specific doctor from the doctors collection.

        Args:
            doctor_id (str): The Firestore document ID of the doctor in the doctors collection.
            slot (str): The time slot to remove in YYYY-MM-DD-HH:MM format.

        Returns:
            bool: True if successful, False otherwise.
        """
        if not firebase_initialized or not db:
            print("Firebase not initialized. Cannot remove doctor availability.")
            return False
            
        try:
            # Load the doctor document from doctors collection
            doctor_doc = db.collection('doctors').document(doctor_id).get()
            
            if not doctor_doc.exists:
                print(f"Doctor with ID {doctor_id} not found in doctors collection.")
                return False
            
            # Get current data
            doctor_data = doctor_doc.to_dict()
            if not doctor_data:
                print(f"Doctor with ID {doctor_id} has no data.")
                return False
                
            # Check if Slots_available exists
            if 'Slots_available' not in doctor_data or not doctor_data['Slots_available']:
                print(f"Doctor with ID {doctor_id} has no availability slots.")
                return False
                
            # Check if the slot exists
            if slot not in doctor_data['Slots_available']:
                print(f"Slot {slot} not found in doctor's availability.")
                return False
                
            # Remove the slot
            doctor_data['Slots_available'].remove(slot)
            
            # Update the doctor document
            db.collection('doctors').document(doctor_id).update({
                'Slots_available': doctor_data['Slots_available'],
                'lastUpdated': datetime.now()
            })
            
            # If doctor has a userId, also update user record
            user_id = doctor_data.get('userId')
            if user_id:
                try:
                    user_ref = db.collection('users').document(user_id)
                    user_doc = user_ref.get()
                    
                    if user_doc.exists:
                        user_ref.update({
                            'Slots_available': doctor_data['Slots_available']
                        })
                        print(f"Also updated user record {user_id} with removed slot")
                except Exception as e:
                    print(f"Error updating user record: {e}")
            
            print(f"Successfully removed slot {slot} from doctor {doctor_id}")
            return True
            
        except Exception as e:
            print(f"Error removing doctor availability: {e}")
            return False

