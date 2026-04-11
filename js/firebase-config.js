// ============================================================
// IMPORTANT: Replace the firebaseConfig below with your own
// Firebase project credentials from the Firebase Console
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD5IA9qskUdPRO7d75QWXTYTDzq0Pu_xac",
  authDomain: "match-summary.firebaseapp.com",
  projectId: "match-summary",
  storageBucket: "match-summary.firebasestorage.app",
  messagingSenderId: "736786933007",
  appId: "1:736786933007:web:1c3ee9e23792913a62ca7a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
