from .appointment import Appointment
from .firebase_config import firebase_initialized
from datetime import datetime


class AppointmentTool:
    """
    A class to handle appointment-related tools.
    """
    
    @staticmethod
    def book_doctor_appointment_tool(patient_name: str, time: str, doctor_name: str):
        """
        Books a doctor's appointment.

        Args:
            patient_name (str): The name of the patient.
            time (str): The appointment time. Can be in format 'HH:MM', 'YYYY-MM-DD-HH:MM', or 'YYYY-MM-DD at HH:MM'.
            doctor_name (str): The name of the doctor.

        Returns:
            str: A message indicating the booking status.
        """
        print(f"BOOKING APPOINTMENT: Patient: {patient_name}, Time: {time}, Doctor: {doctor_name}")
        
        # Ensure Firebase is initialized
        firebase_ready = Appointment.force_firebase_initialization()
        if not firebase_ready:
            print("ERROR: Firebase is not properly initialized. Cannot book appointment.")
            return "Error: The appointment system is currently unavailable. Please try again later or contact support."
            
        if Appointment.book_appointment(patient_name, time, doctor_name):
            print(f"SUCCESS: Appointment booked for {patient_name} with Dr. {doctor_name} at {time}")
            return f"✅ Booking successful for {patient_name} with Dr. {doctor_name} at {time}."
        else:
            print(f"ERROR: Failed to book appointment for {patient_name} with Dr. {doctor_name} at {time}")
            return f"❌ Error booking appointment. The requested time slot '{time}' is not available for Dr. {doctor_name}. Please select one of the available time slots shown."

    @staticmethod
    def add_doctor_availability_tool(doctor_id: str, date: str, times: str):
        """
        Adds availability slots for a doctor.

        Args:
            doctor_id (str): The Firestore document ID of the doctor.
            date (str): The date in YYYY-MM-DD format.
            times (str): Comma-separated list of time slots in HH:MM format.

        Returns:
            str: A message indicating success or failure.
        """
        print(f"ADDING AVAILABILITY: Doctor ID: {doctor_id}, Date: {date}, Times: {times}")
        
        # Ensure Firebase is initialized
        firebase_ready = Appointment.force_firebase_initialization()
        if not firebase_ready:
            print("ERROR: Firebase is not properly initialized. Cannot add availability.")
            return "Error: The availability system is currently unavailable. Please try again later or contact support."
        
        # Parse the time slots
        time_slots = [t.strip() for t in times.split(',')]
        
        if not time_slots:
            return "❌ Error: No time slots provided."
        
        # Validate the date format
        if not date or len(date.split('-')) != 3:
            return "❌ Error: Invalid date format. Please use YYYY-MM-DD."
        
        # Add the availability
        if Appointment.add_doctor_availability(doctor_id, date, time_slots):
            return f"✅ Successfully added {len(time_slots)} availability slots for doctor {doctor_id} on {date}."
        else:
            return f"❌ Error adding availability for doctor {doctor_id}. Please check the doctor ID and try again."

    @staticmethod
    def remove_doctor_availability_tool(doctor_id: str, slot: str):
        """
        Removes an availability slot for a doctor.

        Args:
            doctor_id (str): The Firestore document ID of the doctor.
            slot (str): The time slot to remove in YYYY-MM-DD-HH:MM format.

        Returns:
            str: A message indicating success or failure.
        """
        print(f"REMOVING AVAILABILITY: Doctor ID: {doctor_id}, Slot: {slot}")
        
        # Ensure Firebase is initialized
        firebase_ready = Appointment.force_firebase_initialization()
        if not firebase_ready:
            print("ERROR: Firebase is not properly initialized. Cannot remove availability.")
            return "Error: The availability system is currently unavailable. Please try again later or contact support."
        
        # Validate the slot format
        if not slot or len(slot.split('-')) < 4:
            return "❌ Error: Invalid slot format. Please use YYYY-MM-DD-HH:MM."
        
        # Remove the availability
        if Appointment.remove_doctor_availability(doctor_id, slot):
            return f"✅ Successfully removed availability slot {slot} for doctor {doctor_id}."
        else:
            return f"❌ Error removing availability for doctor {doctor_id}. Please check the doctor ID and slot and try again."

    @staticmethod
    def get_doctor_details_tool() -> list:
        """
        Retrieves information about all doctors, including their available slots.

        Returns:
            list: A list of dictionaries with doctor information including availability slots.
        """
        print("FETCHING DOCTOR DETAILS FROM FIRESTORE...")
        
        # Ensure Firebase is initialized
        firebase_ready = Appointment.force_firebase_initialization()
        if not firebase_ready:
            print("ERROR: Firebase is not properly initialized. Cannot retrieve doctor details.")
            return "Error: The doctor information system is currently unavailable. Please try again later or contact support."
            
        doctors_data = Appointment.load_doctor_details()
        
        if not doctors_data:
            print("ERROR: No doctors available in Firestore.")
            return "No doctors available at the moment. Please try again later."
        
        print(f"SUCCESS: Loaded {len(doctors_data)} doctors from Firestore")
        
        # Format the doctor data to show available slots in a friendly format
        formatted_doctors = []
        for doctor in doctors_data:
            print(f"Processing doctor: {doctor.get('name', doctor.get('fullName', 'Unknown'))}")
            
            # Format time slots to be more readable
            available_slots = []
            if 'Slots_available' in doctor and doctor['Slots_available']:
                print(f"  - Has {len(doctor['Slots_available'])} available slots")
                for slot in doctor['Slots_available']:
                    # Check if slot is a datetime object (DatetimeWithNanoseconds from Firestore)
                    if hasattr(slot, 'strftime'):
                        # It's a datetime object, format it properly
                        date_str = slot.strftime("%Y-%m-%d")
                        time_str = slot.strftime("%H:%M")
                        formatted_slot = f"{date_str} at {time_str}"
                        available_slots.append(formatted_slot)
                    # Check if slot is a string and in the new format (YYYY-MM-DD-HH:MM)
                    elif isinstance(slot, str) and '-' in slot:
                        parts = slot.split('-')
                        if len(parts) >= 4:
                            # Format is YYYY-MM-DD-HH:MM
                            date_str = f"{parts[0]}-{parts[1]}-{parts[2]}"
                            time_str = parts[3]
                            
                            # Use consistent format that matches exactly what the booking function expects
                            formatted_slot = f"{date_str} at {time_str}"
                            available_slots.append(formatted_slot)
                        else:
                            # For legacy format with fewer parts
                            today = datetime.now().strftime("%Y-%m-%d")
                            formatted_slot = f"{today} at {slot}"
                            available_slots.append(formatted_slot)
                    else:
                        # For legacy format (just time without date or other formats), create a properly formatted slot
                        today = datetime.now().strftime("%Y-%m-%d")
                        slot_str = str(slot)  # Convert to string in case it's not already
                        formatted_slot = f"{today} at {slot_str}"
                        available_slots.append(formatted_slot)
            else:
                print(f"  - No available slots")
            
            # Create a cleaned version of the doctor data
            formatted_doctor = {
                'name': doctor.get('name', doctor.get('fullName', 'Unknown')),
                'specialization': doctor.get('specialization', 'General'),
                'available_slots': available_slots,
                'email': doctor.get('email', ''),
                'id': doctor.get('id', '')  # Include the ID for reference
            }
            
            formatted_doctors.append(formatted_doctor)
        
        # Add a log statement to show what doctors were found
        print(f"RETURNING {len(formatted_doctors)} doctors to the agent:")
        for idx, doc in enumerate(formatted_doctors):
            print(f"  Doctor #{idx+1}: {doc['name']} ({doc['specialization']}) - {len(doc['available_slots'])} slots")
        
        return formatted_doctors
