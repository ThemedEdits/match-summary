import { db } from './firebase-config.js';
import { requireAuth } from './auth-guard.js';
import { showToast, showConfirm } from './popup.js';
import {
  collection, query, where, getDocs, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

requireAuth(async (user) => {
  document.getElementById('heroName').textContent = user.displayName?.split(' ')[0] || 'Scorer';

  try {
    const tSnap = await getDocs(query(collection(db, 'templates'), where('userId', '==', user.uid)));
    document.getElementById('statTemplates').textContent = tSnap.size;

    const sSnap = await getDocs(query(collection(db, 'summaries'), where('userId', '==', user.uid)));
    document.getElementById('statSummaries').textContent = sSnap.size;

    const container = document.getElementById('recentSummaries');
    if (sSnap.size === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="image-off"></i></div><p>No summaries yet. <a href="generate.html">Generate your first one!</a></p></div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    container.innerHTML = '';
    const docs = [];
    sSnap.forEach(d => docs.push({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    docs.slice(0, 6).forEach((s, i) => {
      const card = document.createElement('div');
      card.className = 'recent-card reveal';
      card.style.setProperty('--delay', `${i * 0.06}s`);
      card.innerHTML = `
        ${s.imageUrl
          ? `<img src="${s.imageUrl}" alt="summary" />`
          : `<div class="recent-card-placeholder"><i data-lucide="image"></i></div>`}
        <div class="recent-card-info">
          <h4>${s.matchTitle || 'Match Summary'}</h4>
          <p>${s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : ''}</p>
          <div class="recent-card-actions">
            ${s.imageUrl ? `<a href="${s.imageUrl}" download class="btn-sm"><i data-lucide="download"></i></a>` : ''}
            <button class="btn-sm danger" onclick="deleteSummary('${s.id}', this)"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();

  } catch (e) {
    showToast('Could not load data — check Firestore rules.', 'danger');
  }
});

window.deleteSummary = async function (id, btn) {
  const confirmed = await showConfirm('Delete this summary?', 'The summary image and its data will be permanently removed.', 'Delete');
  if (!confirmed) return;
  btn.disabled = true;
  try {
    await deleteDoc(doc(db, 'summaries', id));
    showToast('Summary deleted.', 'success');
    // Remove card from DOM
    btn.closest('.recent-card')?.remove();
    // Update stat counter
    const statEl = document.getElementById('statSummaries');
    if (statEl) statEl.textContent = Math.max(0, parseInt(statEl.textContent || '0') - 1);
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'danger');
    btn.disabled = false;
  }
};