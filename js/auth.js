import { auth } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Redirect if already logged in
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = 'pages/dashboard.html';
  }
});

function showError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

window.loginWithEmail = async function () {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return showError('Please fill in all fields.');
  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = 'pages/dashboard.html';
  } catch (e) {
    showError(friendlyError(e.code));
  }
};

window.signupWithEmail = async function () {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  if (!name || !email || !password) return showError('Please fill in all fields.');
  if (password.length < 6) return showError('Password must be at least 6 characters.');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    window.location.href = 'pages/dashboard.html';
  } catch (e) {
    showError(friendlyError(e.code));
  }
};

window.loginWithGoogle = async function () {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
    window.location.href = 'pages/dashboard.html';
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') showError(friendlyError(e.code));
  }
};

function friendlyError(code) {
  const map = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}
