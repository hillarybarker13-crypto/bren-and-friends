import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Existing BREN & FRIENDS Firebase project.
// Work Hub uses separate Firestore collections so its data stays isolated.
const firebaseConfig = {
  apiKey: "AIzaSyCSphUN8iAGJw89W3V_0hZFm9xfSivHutk",
  authDomain: "bren-and-friends.firebaseapp.com",
  projectId: "bren-and-friends",
  storageBucket: "bren-and-friends.firebasestorage.app",
  messagingSenderId: "561543591902",
  appId: "1:561543591902:web:bdd9073e9725c37abc0f4f",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
