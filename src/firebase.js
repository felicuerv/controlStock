import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";


const firebaseConfig = {
    apiKey: "AIzaSyDkViVcZo_9ynd2JaeXnaD_mJrDwn7oLPs",
    authDomain: "control-refrigeracion.firebaseapp.com",
    projectId: "control-refrigeracion",
    storageBucket: "control-refrigeracion.firebasestorage.app",
    messagingSenderId: "514226820546",
    appId: "1:514226820546:web:c0d8a2148a1a173656b25b"
  };
  
  // Initialize Firebase
  const app = initializeApp(firebaseConfig);


export const db = getFirestore(app);
export const auth = getAuth(app);