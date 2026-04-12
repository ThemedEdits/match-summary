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
  if (user) window.location.href = 'pages/dashboard.html';
});

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function friendlyError(code) {
  const map = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

window.loginWithEmail = async function () {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return showError('loginError', 'Please fill in all fields.');

  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="auth-loading"></span>';

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = 'pages/dashboard.html';
  } catch (e) {
    showError('loginError', friendlyError(e.code));
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="log-in"></i> Sign In';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
};

window.signupWithEmail = async function () {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  if (!name || !email || !password) return showError('signupError', 'Please fill in all fields.');
  if (password.length < 6) return showError('signupError', 'Password must be at least 6 characters.');

  const btn = document.getElementById('signupBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="auth-loading"></span>';

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    window.location.href = 'pages/dashboard.html';
  } catch (e) {
    showError('signupError', friendlyError(e.code));
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="user-plus"></i> Create Account';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
};

window.loginWithGoogle = async function () {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
    window.location.href = 'pages/dashboard.html';
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') {
      showError('loginError', friendlyError(e.code));
      showError('signupError', friendlyError(e.code));
    }
  }
};