import json
import os
from typing import Dict, List, Optional, Any
import datetime

# Paths to database files
DOCTOR_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "database", "doctor_details.json")
PATIENT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "database", "patient_details.json")

def initialize_db_if_empty():
    """Initialize the database files if they don't exist or are empty"""
    try:
        # Create database directory if it doesn't exist
        db_dir = os.path.dirname(DOCTOR_DB_PATH)
        if not os.path.exists(db_dir):
            os.makedirs(db_dir)
        
        # Initialize doctor database
        if not os.path.exists(DOCTOR_DB_PATH) or os.path.getsize(DOCTOR_DB_PATH) == 0:
            with open(DOCTOR_DB_PATH, 'w') as f:
                json.dump([], f, indent=3)
            print(f"Initialized doctor database at {DOCTOR_DB_PATH}")
        
        # Initialize patient database
        if not os.path.exists(PATIENT_DB_PATH) or os.path.getsize(PATIENT_DB_PATH) == 0:
            with open(PATIENT_DB_PATH, 'w') as f:
                json.dump([], f, indent=3)
            print(f"Initialized patient database at {PATIENT_DB_PATH}")
        
        # Verify files exist and are valid JSON
        verify_doctor_db = False
        try:
            with open(DOCTOR_DB_PATH, 'r') as f:
                data = json.load(f)
                if isinstance(data, list):
                    verify_doctor_db = True
        except (json.JSONDecodeError, IOError):
            verify_doctor_db = False
        
        verify_patient_db = False
        try:
            with open(PATIENT_DB_PATH, 'r') as f:
                data = json.load(f)
                if isinstance(data, list):
                    verify_patient_db = True
        except (json.JSONDecodeError, IOError):
            verify_patient_db = False
        
        if not verify_doctor_db:
            print(f"Warning: Doctor database could not be verified, reinitializing")
            with open(DOCTOR_DB_PATH, 'w') as f:
                json.dump([], f, indent=3)
        
        if not verify_patient_db:
            print(f"Warning: Patient database could not be verified, reinitializing")
            with open(PATIENT_DB_PATH, 'w') as f:
                json.dump([], f, indent=3)
                
        return True
    except Exception as e:
        print(f"Error initializing database: {str(e)}")
        return False

# Doctor database functions
def read_doctor_db() -> List[Dict]:
    """Read the doctor database"""
    # Ensure database is initialized
    if not initialize_db_if_empty():
        print("Warning: Failed to initialize database before reading doctor data")
        return []
        
    try:
        with open(DOCTOR_DB_PATH, 'r') as f:
            try:
                data = json.load(f)
                return data
            except json.JSONDecodeError as e:
                print(f"Error parsing doctor database JSON: {str(e)}")
                return []
    except IOError as e:
        print(f"Error reading doctor database file: {str(e)}")
        return []

def write_doctor_db(data: List[Dict]):
    """Write to the doctor database"""
    try:
        with open(DOCTOR_DB_PATH, 'w') as f:
            json.dump(data, f, indent=3)
        
        # Verify the file was written correctly
        if os.path.exists(DOCTOR_DB_PATH) and os.path.getsize(DOCTOR_DB_PATH) > 0:
            return True
        else:
            print(f"Error: Doctor database file is empty after write operation")
            return False
    except Exception as e:
        print(f"Error writing to doctor database: {str(e)}")
        return False

def doctor_exists(email: str) -> bool:
    """Check if a doctor exists in the database"""
    print(f"Checking if doctor exists: {email}")
    
    # Get absolute path
    abs_path = os.path.abspath(DOCTOR_DB_PATH)
    
    # Check if file exists
    if not os.path.exists(abs_path):
        print(f"Doctor database file does not exist: {abs_path}")
        return False
    
    try:
        with open(abs_path, 'r') as f:
            content = f.read().strip()
            if not content:
                return False
                
            doctors = json.loads(content)
            return any(doctor.get('email') == email for doctor in doctors)
    except Exception as e:
        print(f"Error checking if doctor exists: {str(e)}")
        return False

def authenticate_doctor(email: str, password: str) -> Optional[Dict]:
    """Authenticate a doctor with email and password"""
    print(f"Authenticating doctor: {email}")
    
    # Get absolute path
    abs_path = os.path.abspath(DOCTOR_DB_PATH)
    print(f"Doctor DB absolute path: {abs_path}")
    
    # Check if file exists
    if not os.path.exists(abs_path):
        print(f"Doctor database file does not exist: {abs_path}")
        return None
    
    # Read database directly
    try:
        with open(abs_path, 'r') as f:
            content = f.read().strip()
            if not content:
                print("Doctor database is empty")
                return None
                
            doctors = json.loads(content)
            for doctor in doctors:
                if doctor.get('email') == email and doctor.get('password') == password:
                    print(f"Doctor authenticated successfully: {email}")
                    return doctor
                    
            print(f"Invalid credentials for doctor: {email}")
            return None
    except Exception as e:
        print(f"Error authenticating doctor: {str(e)}")
        return None

def register_doctor(name: str, email: str, password: str, specialization: str) -> Dict:
    """Register a new doctor"""
    print(f"Registering doctor: {email}")
    
    # Get absolute path
    abs_path = os.path.abspath(DOCTOR_DB_PATH)
    print(f"Doctor DB absolute path: {abs_path}")
    
    # Ensure database directory exists
    db_dir = os.path.dirname(abs_path)
    if not os.path.exists(db_dir):
        try:
            os.makedirs(db_dir, exist_ok=True)
            print(f"Created doctor database directory: {db_dir}")
        except Exception as e:
            print(f"Error creating doctor database directory: {str(e)}")
            raise ValueError(f"Could not create database directory: {str(e)}")
    
    # Check for existing doctor
    existing = None
    current_data = []
    
    # Read current data
    if os.path.exists(abs_path):
        try:
            with open(abs_path, 'r') as f:
                content = f.read().strip()
                if content:
                    current_data = json.loads(content)
                    # Check if doctor exists
                    existing = next((d for d in current_data if d.get('email') == email), None)
        except Exception as e:
            print(f"Error reading doctor database: {str(e)}")
            # Initialize with empty list if error
            current_data = []
    
    if existing:
        print(f"Doctor already exists: {email}")
        raise ValueError("Doctor with this email already exists")
    
    new_doctor = {
        "name": name,
        "email": email,
        "password": password,
        "specialization": specialization,
        "Slots_available": [],
        "Bookings": []
    }
    
    # Add new doctor to data
    current_data.append(new_doctor)
    print(f"New doctor count: {len(current_data)}")
    
    # Direct file write for reliability
    try:
        with open(abs_path, 'w') as f:
            json.dump(current_data, f, indent=3)
        print(f"Wrote doctor data to file: {abs_path}")
        print(f"File size after write: {os.path.getsize(abs_path)} bytes")
    except Exception as e:
        print(f"Error writing doctor data to file: {str(e)}")
        raise ValueError(f"Failed to save doctor registration: {str(e)}")
    
    # Verify doctor was added by reading the file again
    try:
        with open(abs_path, 'r') as f:
            content = f.read().strip()
            if not content:
                print(f"Error: File is empty after writing")
                raise ValueError("Registration failed: Database file is empty after writing")
                
            verify_data = json.loads(content)
            if any(d.get('email') == email for d in verify_data):
                print(f"Successfully verified doctor registration: {email}")
            else:
                print(f"Doctor not found in database after registration: {email}")
                raise ValueError("Doctor registration verification failed")
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON after write: {str(e)}")
        raise ValueError(f"Failed to verify doctor registration: Invalid JSON")
    except Exception as e:
        print(f"Error verifying doctor registration: {str(e)}")
        raise ValueError(f"Failed to verify doctor registration: {str(e)}")
        
    return new_doctor

def add_booking(doctor_email: str, patient_name: str, time: str) -> Dict:
    """Add a booking for a doctor"""
    doctors = read_doctor_db()
    
    for doctor in doctors:
        if doctor['email'] == doctor_email:
            # Check if slot is already booked
            if any(booking['time'] == time for booking in doctor['Bookings']):
                raise ValueError(f"Slot at {time} is already booked")
            
            booking = {
                "patient_name": patient_name,
                "time": time
            }
            
            doctor['Bookings'].append(booking)
            write_doctor_db(doctors)
            return booking
    
    raise ValueError("Doctor not found")

def get_doctor_bookings(doctor_email: str) -> List[Dict]:
    """Get all bookings for a doctor"""
    doctors = read_doctor_db()
    
    for doctor in doctors:
        if doctor['email'] == doctor_email:
            return doctor['Bookings']
    
    raise ValueError("Doctor not found")

def update_doctor_slots(doctor_email: str, slots: List[str]) -> Dict:
    """Update available slots for a doctor"""
    doctors = read_doctor_db()
    
    for doctor in doctors:
        if doctor['email'] == doctor_email:
            doctor['Slots_available'] = slots
            write_doctor_db(doctors)
            return doctor
    
    raise ValueError("Doctor not found")

def get_all_doctors() -> List[Dict]:
    """Get all doctors with basic information (without sensitive data)"""
    doctors = read_doctor_db()
    result = []
    
    for doctor in doctors:
        # Create a copy without password
        doc_info = {
            "name": doctor["name"],
            "email": doctor["email"],
            "specialization": doctor["specialization"],
            "Slots_available": doctor["Slots_available"]
        }
        result.append(doc_info)
    
    return result

def get_doctor_by_email(email: str) -> Optional[Dict]:
    """Get a doctor by email"""
    doctors = read_doctor_db()
    
    for doctor in doctors:
        if doctor['email'] == email:
            return doctor
    
    return None

# Patient database functions
def read_patient_db() -> List[Dict]:
    """Read the patient database"""
    # Ensure database is initialized
    if not initialize_db_if_empty():
        print("Warning: Failed to initialize database before reading patient data")
        return []
        
    try:
        with open(PATIENT_DB_PATH, 'r') as f:
            try:
                data = json.load(f)
                return data
            except json.JSONDecodeError as e:
                print(f"Error parsing patient database JSON: {str(e)}")
                return []
    except IOError as e:
        print(f"Error reading patient database file: {str(e)}")
        return []

def write_patient_db(data: List[Dict]):
    """Write to the patient database"""
    try:
        with open(PATIENT_DB_PATH, 'w') as f:
            json.dump(data, f, indent=3)
        
        # Verify the file was written correctly
        if os.path.exists(PATIENT_DB_PATH) and os.path.getsize(PATIENT_DB_PATH) > 0:
            return True
        else:
            print(f"Error: Patient database file is empty after write operation")
            return False
    except Exception as e:
        print(f"Error writing to patient database: {str(e)}")
        return False

def patient_exists(email: str) -> bool:
    """Check if a patient exists in the database"""
    print(f"Checking if patient exists: {email}")
    
    # Get absolute path
    abs_path = os.path.abspath(PATIENT_DB_PATH)
    
    # Check if file exists
    if not os.path.exists(abs_path):
        print(f"Patient database file does not exist: {abs_path}")
        return False
    
    try:
        with open(abs_path, 'r') as f:
            content = f.read().strip()
            if not content:
                return False
                
            patients = json.loads(content)
            return any(patient.get('email') == email for patient in patients)
    except Exception as e:
        print(f"Error checking if patient exists: {str(e)}")
        return False

def authenticate_patient(email: str, password: str) -> Optional[Dict]:
    """Authenticate a patient with email and password"""
    print(f"Authenticating patient: {email}")
    
    # Get absolute path
    abs_path = os.path.abspath(PATIENT_DB_PATH)
    print(f"Patient DB absolute path: {abs_path}")
    
    # Check if file exists
    if not os.path.exists(abs_path):
        print(f"Patient database file does not exist: {abs_path}")
        return None
    
    # Read database directly
    try:
        with open(abs_path, 'r') as f:
            content = f.read().strip()
            if not content:
                print("Patient database is empty")
                return None
                
            patients = json.loads(content)
            for patient in patients:
                if patient.get('email') == email and patient.get('password') == password:
                    print(f"Patient authenticated successfully: {email}")
                    return patient
                    
            print(f"Invalid credentials for patient: {email}")
            return None
    except Exception as e:
        print(f"Error authenticating patient: {str(e)}")
        return None

def register_patient(name: str, email: str, password: str, age: int = None, medical_history: List[str] = None) -> Dict:
    """Register a new patient"""
    print(f"Registering patient: {email}")
    
    # Get absolute path
    abs_path = os.path.abspath(PATIENT_DB_PATH)
    print(f"Patient DB absolute path: {abs_path}")
    
    # Ensure database directory exists
    db_dir = os.path.dirname(abs_path)
    if not os.path.exists(db_dir):
        try:
            os.makedirs(db_dir, exist_ok=True)
            print(f"Created patient database directory: {db_dir}")
        except Exception as e:
            print(f"Error creating patient database directory: {str(e)}")
            raise ValueError(f"Could not create database directory: {str(e)}")
    
    # Check for existing patient
    existing = None
    current_data = []
    
    # Read current data
    if os.path.exists(abs_path):
        try:
            with open(abs_path, 'r') as f:
                content = f.read().strip()
                if content:
                    current_data = json.loads(content)
                    # Check if patient exists
                    existing = next((p for p in current_data if p.get('email') == email), None)
        except Exception as e:
            print(f"Error reading patient database: {str(e)}")
            # Initialize with empty list if error
            current_data = []
    
    if existing:
        print(f"Patient already exists: {email}")
        raise ValueError("Patient with this email already exists")
    
    new_patient = {
        "name": name,
        "email": email,
        "password": password,
        "age": age,
        "medical_history": medical_history or [],
        "appointments": []
    }
    
    # Add new patient to data
    current_data.append(new_patient)
    print(f"New patient count: {len(current_data)}")
    
    # Direct file write for reliability
    try:
        with open(abs_path, 'w') as f:
            json.dump(current_data, f, indent=3)
        print(f"Wrote patient data to file: {abs_path}")
        print(f"File size after write: {os.path.getsize(abs_path)} bytes")
    except Exception as e:
        print(f"Error writing patient data to file: {str(e)}")
        raise ValueError(f"Failed to save patient registration: {str(e)}")
    
    # Verify patient was added by reading the file again
    try:
        with open(abs_path, 'r') as f:
            content = f.read().strip()
            if not content:
                print(f"Error: File is empty after writing")
                raise ValueError("Registration failed: Database file is empty after writing")
                
            verify_data = json.loads(content)
            if any(p.get('email') == email for p in verify_data):
                print(f"Successfully verified patient registration: {email}")
            else:
                print(f"Patient not found in database after registration: {email}")
                raise ValueError("Patient registration verification failed")
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON after write: {str(e)}")
        raise ValueError(f"Failed to verify patient registration: Invalid JSON")
    except Exception as e:
        print(f"Error verifying patient registration: {str(e)}")
        raise ValueError(f"Failed to verify patient registration: {str(e)}")
        
    return new_patient

def add_patient_appointment(patient_email: str, doctor_email: str, time: str) -> Dict:
    """Add an appointment to a patient's record"""
    patients = read_patient_db()
    doctors = read_doctor_db()
    
    # Verify doctor exists
    doctor = next((d for d in doctors if d['email'] == doctor_email), None)
    if not doctor:
        raise ValueError("Doctor not found")
    
    appointment = {
        "doctor_name": doctor["name"],
        "doctor_email": doctor_email,
        "time": time,
        "status": "scheduled"
    }
    
    for patient in patients:
        if patient['email'] == patient_email:
            patient['appointments'].append(appointment)
            write_patient_db(patients)
            
            # Also add the booking to the doctor's record
            add_booking(doctor_email, patient['name'], time)
            
            return appointment
    
    raise ValueError("Patient not found")

def get_patient_appointments(patient_email: str) -> List[Dict]:
    """Get all appointments for a patient"""
    patients = read_patient_db()
    
    for patient in patients:
        if patient['email'] == patient_email:
            return patient['appointments']
    
    raise ValueError("Patient not found")

def update_patient_medical_history(patient_email: str, medical_history: List[str]) -> Dict:
    """Update medical history for a patient"""
    patients = read_patient_db()
    
    for patient in patients:
        if patient['email'] == patient_email:
            patient['medical_history'] = medical_history
            write_patient_db(patients)
            return patient
    
    raise ValueError("Patient not found")

def get_patient_by_email(email: str) -> Optional[Dict]:
    """Get a patient by email"""
    patients = read_patient_db()
    
    for patient in patients:
        if patient['email'] == email:
            return patient
    
    return None

def get_all_patients() -> List[Dict]:
    """Get all patients with basic information (without sensitive data)"""
    patients = read_patient_db()
    result = []
    
    for patient in patients:
        # Create a copy without password
        patient_info = {k: v for k, v in patient.items() if k != "password"}
        result.append(patient_info)
    
    return result

def delete_appointment(doctor_email: str, patient_name: str, time: str) -> bool:
    """Delete an appointment from both doctor's bookings and patient's appointments"""
    # First remove from doctor's bookings
    doctors = read_doctor_db()
    doctor_updated = False
    
    for doctor in doctors:
        if doctor['email'] == doctor_email:
            # Find and remove the booking
            doctor['Bookings'] = [
                b for b in doctor['Bookings'] 
                if not (b['patient_name'] == patient_name and b['time'] == time)
            ]
            doctor_updated = True
            break
    
    if not doctor_updated:
        return False
        
    # Save doctor's data
    write_doctor_db(doctors)
    
    # Then remove from patient's appointments
    patients = read_patient_db()
    patient_updated = False
    
    for patient in patients:
        # Find patient by name since we might not have email for booking-only patients
        if patient['name'] == patient_name:
            # Remove the appointment
            patient['appointments'] = [
                a for a in patient['appointments']
                if not (a['doctor_email'] == doctor_email and a['time'] == time)
            ]
            patient_updated = True
            break
    
    if patient_updated:
        write_patient_db(patients)
    
    # Return true even if patient record wasn't found (they might be booking-only)
    return True 