import os
import json
import time
from typing import List, Dict, Any
from .firebase_config import db, firebase_initialized

# Path to existing doctor details JSON file
current_dir = os.path.dirname(os.path.abspath(__file__))
DOCTORS_FILE = os.path.join(os.path.dirname(current_dir), 'database', 'doctor_details.json')

def load_doctors_from_json() -> List[Dict[str, Any]]:
    """Load existing doctor data from JSON file"""
    try:
        with open(DOCTORS_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading doctor data from JSON: {e}")
        return []

def migrate_doctors_to_firestore(doctors: List[Dict[str, Any]]) -> bool:
    """Migrate doctor data to Firestore"""
    if not firebase_initialized or not db:
        print("Firebase not initialized. Cannot migrate data.")
        return False
    
    try:
        # First check if data already exists
        doctors_ref = db.collection('doctors')
        existing_docs = list(doctors_ref.stream())
        
        if existing_docs:
            print(f"Found {len(existing_docs)} existing doctor records in Firestore.")
            should_continue = input("Do you want to add the data anyway? This may create duplicates. (y/n): ")
            if should_continue.lower() != 'y':
                print("Migration cancelled.")
                return False
        
        # Add each doctor to Firestore
        for doctor in doctors:
            # Create a copy of the doctor data
            doctor_data = doctor.copy()
            
            # Remove any existing id field to let Firestore generate one
            doctor_data.pop('id', None)
            
            # Add doctor to Firestore
            doc_ref = doctors_ref.add(doctor_data)
            print(f"Added doctor: {doctor.get('name')} with ID: {doc_ref[1].id}")
            
            # Brief pause to avoid hitting quota limits
            time.sleep(0.5)
        
        print(f"Successfully migrated {len(doctors)} doctors to Firestore.")
        return True
    
    except Exception as e:
        print(f"Error migrating doctor data to Firestore: {e}")
        return False

def create_sample_doctors() -> List[Dict[str, Any]]:
    """Create sample doctor data if JSON file doesn't exist"""
    return [
        {
            "name": "Dr. Rajesh Kumar",
            "email": "rajeshkumar@example.com",
            "specialization": "Dermatologist",
            "Slots_available": ["09:00", "10:00", "11:00", "14:00", "15:00"],
            "Bookings": []
        },
        {
            "name": "Dr. Priya Sharma",
            "email": "priyasharma@example.com",
            "specialization": "Cardiologist",
            "Slots_available": ["08:30", "09:30", "13:00", "16:00"],
            "Bookings": []
        },
        {
            "name": "Dr. Anil Patel",
            "email": "anilpatel@example.com",
            "specialization": "Pediatrician",
            "Slots_available": ["10:00", "11:00", "12:00", "15:00", "16:00"],
            "Bookings": []
        }
    ]

if __name__ == "__main__":
    # Check if Firebase is initialized
    if not firebase_initialized:
        print("Firebase not initialized. Please check your Firebase configuration.")
        exit(1)
    
    # Load doctors from JSON or create sample data
    doctors = load_doctors_from_json()
    if not doctors:
        print("No doctor data found in JSON. Creating sample data.")
        doctors = create_sample_doctors()
    
    # Migrate to Firestore
    success = migrate_doctors_to_firestore(doctors)
    if success:
        print("Migration completed successfully.")
    else:
        print("Migration failed.") 