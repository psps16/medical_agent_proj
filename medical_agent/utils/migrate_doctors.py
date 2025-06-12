import os
import sys
import time
from datetime import datetime
from typing import Dict, Any, List

# Add the project root to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
sys.path.append(project_root)

from medical_agent.utils.firebase_config import db, firebase_initialized, initialize_firebase, get_firestore_client, test_firestore_connection

def delete_test_collection() -> bool:
    """
    Deletes the test collection from Firestore.
    
    Returns:
        bool: True if successful, False otherwise.
    """
    if not firebase_initialized:
        initialize_firebase()
        
    if not db:
        print("Firebase not properly initialized. Cannot delete test collection.")
        return False
        
    try:
        # Get all documents in the test collection
        test_ref = db.collection('test')
        docs = list(test_ref.stream())
        
        if not docs:
            print("Test collection is empty or doesn't exist.")
            return True
            
        # Delete each document
        for doc in docs:
            print(f"Deleting document {doc.id} from test collection...")
            doc.reference.delete()
            
        print(f"Successfully deleted {len(docs)} documents from test collection.")
        return True
    except Exception as e:
        print(f"Error deleting test collection: {e}")
        return False

def migrate_user_doctors_to_doctors_collection() -> bool:
    """
    Migrates users registered as doctors to the doctors collection.
    
    Returns:
        bool: True if successful, False otherwise.
    """
    if not firebase_initialized:
        initialize_firebase()
        
    if not db:
        print("Firebase not properly initialized. Cannot migrate doctors.")
        return False
        
    try:
        # Query for users with userType = doctor
        users_ref = db.collection('users')
        query = users_ref.where("userType", "==", "doctor")
        user_doctors = list(query.stream())
        
        if not user_doctors:
            print("No users registered as doctors found.")
            return True
            
        print(f"Found {len(user_doctors)} users registered as doctors.")
        
        # For each user doctor, create/update a document in the doctors collection
        for user_doc in user_doctors:
            user_data = user_doc.to_dict()
            user_id = user_doc.id
            
            print(f"Processing doctor: {user_data.get('fullName', user_data.get('email', 'Unknown'))}")
            
            # Check if a corresponding doctor already exists
            doctors_ref = db.collection('doctors')
            existing_doctors = list(doctors_ref.where("email", "==", user_data.get('email', '')).stream())
            
            # Prepare the doctor data
            doctor_data = {
                'name': user_data.get('fullName', user_data.get('name', 'Unknown')),
                'email': user_data.get('email', ''),
                'specialization': user_data.get('specialization', 'General'),
                'Slots_available': user_data.get('Slots_available', []),
                'Bookings': user_data.get('Bookings', []),
                'userId': user_id,  # Reference to the original user
                'userType': 'doctor',
                'lastUpdated': datetime.now()
            }
            
            if existing_doctors:
                # Update existing doctor
                existing_doc = existing_doctors[0]
                print(f"  Updating existing doctor document {existing_doc.id}")
                doctors_ref.document(existing_doc.id).update(doctor_data)
            else:
                # Create new doctor
                print(f"  Creating new doctor document")
                result = doctors_ref.add(doctor_data)
                print(f"  Created doctor document with ID: {result[1].id}")
                
            # Slight delay to avoid hitting quota limits
            time.sleep(0.5)
            
        print(f"Successfully migrated {len(user_doctors)} doctors to doctors collection.")
        return True
    
    except Exception as e:
        print(f"Error migrating doctors: {e}")
        return False

def sync_doctor_availability() -> bool:
    """
    Synchronizes availability slots between users and doctors collections.
    
    Returns:
        bool: True if successful, False otherwise.
    """
    if not firebase_initialized:
        initialize_firebase()
        
    if not db:
        print("Firebase not properly initialized. Cannot sync doctor availability.")
        return False
        
    try:
        # Get all doctors from the doctors collection
        doctors_ref = db.collection('doctors')
        doctors = list(doctors_ref.stream())
        
        if not doctors:
            print("No doctors found in doctors collection.")
            return True
            
        print(f"Found {len(doctors)} doctors to sync.")
        
        # For each doctor, check and sync availability with user profile if exists
        for doctor_doc in doctors:
            doctor_data = doctor_doc.to_dict()
            user_id = doctor_data.get('userId')
            
            if not user_id:
                print(f"  Doctor {doctor_doc.id} has no userId. Skipping sync.")
                continue
                
            # Try to get the user document
            try:
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                
                if not user_doc.exists:
                    print(f"  User {user_id} not found. Skipping sync.")
                    continue
                    
                # Get availability and bookings from both
                doctor_slots = doctor_data.get('Slots_available', [])
                doctor_bookings = doctor_data.get('Bookings', [])
                
                user_data = user_doc.to_dict()
                user_slots = user_data.get('Slots_available', [])
                user_bookings = user_data.get('Bookings', [])
                
                # Find differences
                new_doctor_slots = set(doctor_slots) - set(user_slots)
                new_user_slots = set(user_slots) - set(doctor_slots)
                
                # Sync if there are differences
                if new_doctor_slots or new_user_slots:
                    print(f"  Syncing availability for doctor {doctor_data.get('name', 'Unknown')}")
                    
                    # Merge slots and bookings
                    merged_slots = list(set(doctor_slots).union(set(user_slots)))
                    merged_bookings = doctor_bookings + [b for b in user_bookings if b not in doctor_bookings]
                    
                    # Update both documents
                    doctor_doc.reference.update({
                        'Slots_available': merged_slots,
                        'Bookings': merged_bookings,
                        'lastUpdated': datetime.now()
                    })
                    
                    user_ref.update({
                        'Slots_available': merged_slots,
                        'Bookings': merged_bookings
                    })
                    
                    print(f"  Added {len(new_user_slots)} slots from user and {len(new_doctor_slots)} slots from doctor")
                else:
                    print(f"  No differences for doctor {doctor_data.get('name', 'Unknown')}")
                    
            except Exception as e:
                print(f"  Error syncing doctor {doctor_doc.id}: {e}")
                
            # Slight delay to avoid hitting quota limits
            time.sleep(0.5)
            
        print("Successfully synchronized doctor availability.")
        return True
        
    except Exception as e:
        print(f"Error syncing doctor availability: {e}")
        return False

def run_migration():
    """Run the complete migration process"""
    print("=" * 50)
    print("DOCTOR MIGRATION UTILITY")
    print("=" * 50)
    
    # Initialize Firebase
    print("\nInitializing Firebase...")
    if not firebase_initialized:
        success = initialize_firebase()
        if not success:
            print("Failed to initialize Firebase. Exiting.")
            return
    
    # Test connection
    print("\nTesting Firestore connection...")
    if not test_firestore_connection():
        print("Failed to connect to Firestore. Exiting.")
        return
        
    # Delete test collection
    print("\nDeleting test collection...")
    delete_test_collection()
    
    # Migrate doctors
    print("\nMigrating user doctors to doctors collection...")
    migrate_user_doctors_to_doctors_collection()
    
    # Sync availability
    print("\nSynchronizing doctor availability...")
    sync_doctor_availability()
    
    print("\n" + "=" * 50)
    print("MIGRATION COMPLETE")
    print("=" * 50)

if __name__ == "__main__":
    run_migration() 