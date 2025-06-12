import { db } from "../firebase/config";
import { doc, setDoc } from "firebase/firestore";

/**
 * This is a development-only utility to test Firebase permissions
 * and write access. NEVER use this in production.
 */
export const testFirestoreWrite = async () => {
  try {
    // Try to write a test document to Firestore
    const testData = {
      testField: "This is a test document",
      timestamp: new Date()
    };
    
    await setDoc(doc(db, "test", "permission_test"), testData);
    console.log("✅ Successfully wrote to Firestore! Permissions are working.");
    return true;
  } catch (error: any) {
    console.error("❌ Failed to write to Firestore:", error);
    const errorMessage = error.message || "Unknown error";
    console.log("Error message:", errorMessage);
    
    if (errorMessage.includes("permission-denied") || 
        errorMessage.includes("Missing or insufficient permissions")) {
      console.log(`
        🔒 Firebase Security Rules Problem 🔒
        
        You need to update your Firestore security rules in the Firebase console.
        Go to: https://console.firebase.google.com/project/mediagent-9851a/firestore/rules
        
        For development, you can use these permissive rules:
        
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /{document=**} {
              allow read, write: if true;
            }
          }
        }
        
        ⚠️ WARNING: These rules are NOT secure for production! ⚠️
        Only use them for development purposes.
      `);
    }
    
    return false;
  }
}; 