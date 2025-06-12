// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCfVIo3Ki0JqzpQyd1NauQdxtB89nYnnAQ",
  authDomain: "mediagent-9851a.firebaseapp.com",
  projectId: "mediagent-9851a",
  storageBucket: "mediagent-9851a.appspot.com",
  messagingSenderId: "889948364686",
  appId: "1:889948364686:web:58e2a420a16ea4f7850edf",
  measurementId: "G-E9X9D2LBBK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

export { auth, db, analytics }; 