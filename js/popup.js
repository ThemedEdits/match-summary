// =================== CUSTOM POPUP SYSTEM ===================
// Replaces all alert() and confirm() calls with animated modals

let _popupResolve = null;

function getOrCreatePopupContainer() {
  let el = document.getElementById('_cricSnapPopup');
  if (!el) {
    el = document.createElement('div');
    el.id = '_cricSnapPopup';
    el.innerHTML = `
      <div class="popup-backdrop" id="_popupBackdrop"></div>
      <div class="popup-box" id="_popupBox">
        <div class="popup-icon-wrap" id="_popupIcon"></div>
        <h3 class="popup-title" id="_popupTitle"></h3>
        <p class="popup-msg" id="_popupMsg"></p>
        <div class="popup-actions" id="_popupActions"></div>
      </div>
    `;
    document.body.appendChild(el);

    // Inject styles if not already
    if (!document.getElementById('_popupStyles')) {
      const style = document.createElement('style');
      style.id = '_popupStyles';
      style.textContent = `
        #_cricSnapPopup {
          position: fixed; inset: 0; z-index: 99999;
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
        }
        #_cricSnapPopup.hidden { display: none; }
        .popup-backdrop {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(6px);
          animation: popupFadeIn 0.2s ease;
        }
        .popup-box {
          position: relative; z-index: 1;
          background: #111816;
          border: 1px solid #1e2e28;
          border-radius: 18px;
          padding: 28px 28px 24px;
          max-width: 400px; width: 100%;
          text-align: center;
          box-shadow: 0 30px 80px rgba(0,0,0,0.7);
          animation: popupSlideIn 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        .popup-box.danger { border-color: rgba(239,68,68,0.3); }
        .popup-box.success { border-color: rgba(0,200,83,0.3); }
        .popup-box.warning { border-color: rgba(251,191,36,0.3); }
        .popup-icon-wrap {
          width: 52px; height: 52px;
          border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 16px;
          font-size: 24px;
        }
        .popup-icon-wrap.danger { background: rgba(239,68,68,0.12); color: #ef4444; }
        .popup-icon-wrap.success { background: rgba(0,200,83,0.12); color: #00c853; }
        .popup-icon-wrap.warning { background: rgba(251,191,36,0.12); color: #fbbf24; }
        .popup-icon-wrap.info { background: rgba(99,102,241,0.12); color: #818cf8; }
        .popup-icon-wrap svg { width: 24px; height: 24px; }
        .popup-title {
          font-family: 'Teko', sans-serif;
          font-size: 22px; letter-spacing: 0.3px;
          color: #f0f4f2; margin: 0 0 8px;
        }
        .popup-msg {
          font-size: 14px; color: #7a9088;
          margin: 0 0 22px; line-height: 1.6;
        }
        .popup-actions {
          display: flex; gap: 10px; justify-content: center;
        }
        .popup-btn {
          flex: 1; padding: 11px 16px;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px; font-weight: 600;
          cursor: pointer; border: none;
          transition: all 0.2s;
          max-width: 160px;
        }
        .popup-btn.primary { background: #00c853; color: #000; }
        .popup-btn.primary:hover { background: #00e676; transform: translateY(-1px); }
        .popup-btn.danger { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
        .popup-btn.danger:hover { background: rgba(239,68,68,0.25); transform: translateY(-1px); }
        .popup-btn.secondary { background: #1a2420; color: #f0f4f2; border: 1px solid #1e2e28; }
        .popup-btn.secondary:hover { border-color: #00c853; }
        @keyframes popupFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popupSlideIn {
          from { opacity: 0; transform: scale(0.88) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes popupSlideOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(0.92) translateY(6px); }
        }
      `;
      document.head.appendChild(style);
    }
  }
  return el;
}

function closePopup(result) {
  const el = document.getElementById('_cricSnapPopup');
  const box = document.getElementById('_popupBox');
  if (!el) return;
  box.style.animation = 'popupSlideOut 0.2s ease forwards';
  setTimeout(() => {
    el.classList.add('hidden');
    box.style.animation = '';
    if (_popupResolve) { _popupResolve(result); _popupResolve = null; }
  }, 180);
}

// Icons for each type
const POPUP_ICONS = {
  danger: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
};

/**
 * Show a toast-style notification (non-blocking)
 * type: 'success' | 'danger' | 'warning' | 'info'
 */
export function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('_toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = '_toastContainer';
    container.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:99998;
      display:flex; flex-direction:column; gap:10px; align-items:flex-end;
    `;
    document.body.appendChild(container);

    if (!document.getElementById('_toastStyles')) {
      const s = document.createElement('style');
      s.id = '_toastStyles';
      s.textContent = `
        .toast {
          display:flex; align-items:center; gap:10px;
          background:#111816; border:1px solid #1e2e28;
          border-radius:12px; padding:12px 16px;
          font-family:'DM Sans',sans-serif; font-size:14px;
          color:#f0f4f2; max-width:320px;
          box-shadow:0 8px 30px rgba(0,0,0,0.5);
          animation:toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1);
        }
        .toast.out { animation:toastOut 0.25s ease forwards; }
        .toast svg { width:16px;height:16px;flex-shrink:0; }
        .toast.success { border-color:rgba(0,200,83,0.3); }
        .toast.success svg { color:#00c853; }
        .toast.danger { border-color:rgba(239,68,68,0.3); }
        .toast.danger svg { color:#ef4444; }
        .toast.warning { border-color:rgba(251,191,36,0.3); }
        .toast.warning svg { color:#fbbf24; }
        .toast.info svg { color:#818cf8; }
        @keyframes toastIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes toastOut { from{opacity:1;transform:translateX(0)} to{opacity:0;transform:translateX(20px)} }
      `;
      document.head.appendChild(s);
    }
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${POPUP_ICONS[type] || POPUP_ICONS.info}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 280);
  }, duration);
}

/**
 * Show a blocking alert dialog
 * type: 'danger' | 'warning' | 'success' | 'info'
 */
export function showAlert(title, message, type = 'info') {
  return new Promise(resolve => {
    _popupResolve = resolve;
    const el = getOrCreatePopupContainer();
    el.classList.remove('hidden');

    document.getElementById('_popupBox').className = `popup-box ${type}`;
    document.getElementById('_popupIcon').className = `popup-icon-wrap ${type}`;
    document.getElementById('_popupIcon').innerHTML = POPUP_ICONS[type] || POPUP_ICONS.info;
    document.getElementById('_popupTitle').textContent = title;
    document.getElementById('_popupMsg').textContent = message;
    document.getElementById('_popupActions').innerHTML = `
      <button class="popup-btn primary" onclick="window._closePopup(true)">OK</button>
    `;
  });
}

/**
 * Show a double-confirm dialog for dangerous actions
 * Returns true if user confirmed twice
 */
export function showConfirm(title, message, confirmLabel = 'Delete', type = 'danger') {
  return new Promise(resolve => {
    _popupResolve = resolve;
    const el = getOrCreatePopupContainer();
    el.classList.remove('hidden');

    document.getElementById('_popupBox').className = `popup-box ${type}`;
    document.getElementById('_popupIcon').className = `popup-icon-wrap ${type}`;
    document.getElementById('_popupIcon').innerHTML = POPUP_ICONS['trash'] || POPUP_ICONS.danger;
    document.getElementById('_popupTitle').textContent = title;
    document.getElementById('_popupMsg').textContent = message;
    document.getElementById('_popupActions').innerHTML = `
      <button class="popup-btn secondary" onclick="window._closePopup(false)">Cancel</button>
      <button class="popup-btn danger" id="_confirmBtn1">${confirmLabel}</button>
    `;

    // First confirm click shows second confirmation
    document.getElementById('_confirmBtn1').addEventListener('click', () => {
      document.getElementById('_popupTitle').textContent = 'Are you absolutely sure?';
      document.getElementById('_popupMsg').textContent = 'This action cannot be undone.';
      document.getElementById('_popupIcon').innerHTML = POPUP_ICONS.danger;
      document.getElementById('_popupActions').innerHTML = `
        <button class="popup-btn secondary" onclick="window._closePopup(false)">No, keep it</button>
        <button class="popup-btn danger" onclick="window._closePopup(true)">Yes, ${confirmLabel.toLowerCase()}</button>
      `;
      // Shake animation on box
      const box = document.getElementById('_popupBox');
      box.style.animation = 'none';
      setTimeout(() => { box.style.animation = 'popupSlideIn 0.2s ease'; }, 10);
    });
  });
}

// Global handler so inline onclick works
window._closePopup = closePopup;