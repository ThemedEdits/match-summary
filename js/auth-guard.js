import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function requireAuth(callback) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = '../index.html';
      return;
    }
    // Show user name in navbar
    const nameEl = document.getElementById('userNameDisplay');
    if (nameEl) nameEl.textContent = user.displayName || user.email;
    callback(user);
  });
}

window.logoutUser = async function () {
  await signOut(auth);
  window.location.href = '../index.html';
};
