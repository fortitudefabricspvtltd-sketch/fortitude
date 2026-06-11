import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA5OU2JZdmTpjDXJILxPQ-Ypuum0Wkhk3M",
  authDomain: "fortitude-b0a25.firebaseapp.com",
  projectId: "fortitude-b0a25",
  storageBucket: "fortitude-b0a25.firebasestorage.app",
  messagingSenderId: "506151176055",
  appId: "1:506151176055:web:81a95ce6f7094f4bb8c372",
  measurementId: "G-5NYJXJSXDQ"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
