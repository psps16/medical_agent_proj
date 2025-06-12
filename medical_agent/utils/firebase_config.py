import os
import firebase_admin
from firebase_admin import credentials, firestore

# Firebase configuration for backend
FIREBASE_PROJECT_ID = "mediagent-9851a"

# Path to service account key file
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
KEY_FILE_PATH = os.path.join(project_root, "firebase-key.json")

def initialize_firebase():
    """Initialize Firebase Admin SDK for backend use"""
    try:
        # Check if already initialized
        if not firebase_admin._apps:
            if os.path.exists(KEY_FILE_PATH):
                # Use service account key file if available
                cred = credentials.Certificate(KEY_FILE_PATH)
                firebase_admin.initialize_app(cred, {
                    'projectId': FIREBASE_PROJECT_ID,
                })
                print(f"Firebase Admin SDK initialized with service account for project: {FIREBASE_PROJECT_ID}")
            else:
                # Fall back to application default credentials
                try:
                    print(f"Service account key file not found at '{KEY_FILE_PATH}'. Trying application default credentials...")
                    cred = credentials.ApplicationDefault()
                    firebase_admin.initialize_app(cred, {
                        'projectId': FIREBASE_PROJECT_ID,
                    })
                    print(f"Firebase Admin SDK initialized with application default credentials for project: {FIREBASE_PROJECT_ID}")
                except Exception as e:
                    print(f"Error with application default credentials: {e}")
                    print("-----------------------------------------------------------")
                    print("⚠️ FIREBASE CONFIGURATION ERROR ⚠️")
                    print("-----------------------------------------------------------")
                    print(f"Please download a service account key file from Firebase console and save it as {KEY_FILE_PATH}")
                    print("\nTo set up Firebase for the medical agent:")
                    print("1. Go to Firebase console (https://console.firebase.google.com)")
                    print(f"2. Select project '{FIREBASE_PROJECT_ID}'")
                    print("3. Go to Project Settings > Service accounts")
                    print("4. Click 'Generate new private key'")
                    print(f"5. Save the JSON file as '{KEY_FILE_PATH}'")
                    print("-----------------------------------------------------------")
                    return False
            return True
        else:
            # Already initialized
            print("Firebase already initialized")
            return True
    except Exception as e:
        print(f"Error initializing Firebase Admin SDK: {e}")
        return False

# Get Firestore client
def get_firestore_client():
    """Get Firestore client if Firebase is initialized"""
    if firebase_admin._apps:
        return firestore.client()
    return None

# Test Firestore connection
def test_firestore_connection():
    """Test if Firestore connection is working properly"""
    if not firebase_initialized or not db:
        return False
    
    try:
        # Try to get doctors collection
        doctors_ref = db.collection('doctors')
        # Just check if we can access the first document
        # This will throw an exception if access is denied
        for doc in doctors_ref.limit(1).stream():
            print(f"Successfully accessed Firestore: Found document {doc.id}")
            return True
        
        print("Successfully accessed Firestore: No doctors found but connection works")
        return True
    except Exception as e:
        print(f"Error testing Firestore connection: {e}")
        return False

# Initialize Firebase on import
firebase_initialized = initialize_firebase()
db = get_firestore_client()

# Log initialization status
if firebase_initialized and db:
    print("Firebase and Firestore successfully initialized")
    # Test the connection
    if test_firestore_connection():
        print("✅ Firestore connection test successful")
    else:
        print("❌ Firestore connection test failed - Check your permissions")
elif firebase_initialized:
    print("Firebase initialized but couldn't get Firestore client")
else:
    print("Failed to initialize Firebase") 