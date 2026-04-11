import { db } from './firebase-config.js';
import { requireAuth } from './auth-guard.js';
import {
  collection, query, where, getDocs, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

requireAuth(async (user) => {
  document.getElementById('heroName').textContent = user.displayName?.split(' ')[0] || 'Scorer';

  // Load stats
  try {
    const tSnap = await getDocs(query(collection(db, 'templates'), where('userId', '==', user.uid)));
    document.getElementById('statTemplates').textContent = tSnap.size;

    const sSnap = await getDocs(query(collection(db, 'summaries'), where('userId', '==', user.uid)));
    document.getElementById('statSummaries').textContent = sSnap.size;

    // Recent summaries
    if (sSnap.size > 0) {
      const container = document.getElementById('recentSummaries');
      container.innerHTML = '';
      const docs = [];
      sSnap.forEach(d => docs.push({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      docs.slice(0, 6).forEach(s => {
        const card = document.createElement('div');
        card.className = 'recent-card';
        card.innerHTML = `
          ${s.imageUrl ? `<img src="${s.imageUrl}" alt="summary" />` : `<div style="aspect-ratio:1;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:32px;">🏏</div>`}
          <div class="recent-card-info">
            <h4>${s.matchTitle || 'Match Summary'}</h4>
            <p>${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ''}</p>
          </div>
        `;
        container.appendChild(card);
      });
    }
  } catch (e) {
    console.warn('Firestore error (check rules):', e.message);
  }
});
