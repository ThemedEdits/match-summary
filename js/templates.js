import { db } from './firebase-config.js';
import { requireAuth } from './auth-guard.js';
import { uploadToCloudinary } from './cloudinary.js';
import {
  collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;
let selectedTemplateFile = null;
let fields = []; // { id, x, y, w, h, type, fontSize, color, fontWeight, textAlign }
let selectedFieldId = null;
let fieldIdCounter = 0;
let canvasScale = 1;
let editingTemplateId = null;

requireAuth((user) => {
  currentUser = user;
  loadTemplates();
});

// =================== TEMPLATES LIST ===================

async function loadTemplates() {
  const grid = document.getElementById('templateGrid');
  try {
    const snap = await getDocs(query(collection(db, 'templates'), where('userId', '==', currentUser.uid)));
    if (snap.empty) {
      grid.innerHTML = '<div class="empty-state" id="emptyTemplates"><div class="empty-icon">🖼️</div><p>No templates yet. Upload your first background!</p></div>';
      return;
    }
    grid.innerHTML = '';
    snap.forEach(d => {
      const t = { id: d.id, ...d.data() };
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <img class="template-card-img" src="${t.imageUrl}" alt="${t.name}" />
        <div class="template-card-body">
          <div class="template-card-name">${t.name}</div>
          <div class="template-card-meta">${t.fields?.length || 0} fields defined</div>
          <div class="template-card-actions">
            <button class="btn-sm" onclick="editTemplate('${t.id}')">✏️ Edit Fields</button>
            <button class="btn-sm danger" onclick="deleteTemplate('${t.id}', this)">🗑</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (e) {
    console.warn('Load templates error:', e.message);
    grid.innerHTML = '<div class="empty-state"><p>Could not load templates. Check Firestore rules.</p></div>';
  }
}

window.deleteTemplate = async function (id, btn) {
  if (!confirm('Delete this template?')) return;
  btn.disabled = true;
  await deleteDoc(doc(db, 'templates', id));
  loadTemplates();
};

window.editTemplate = async function (id) {
  editingTemplateId = id;
  // Load template data
  const snap = await getDocs(query(collection(db, 'templates'), where('userId', '==', currentUser.uid)));
  let tData = null;
  snap.forEach(d => { if (d.id === id) tData = { id: d.id, ...d.data() }; });
  if (!tData) return;

  // Open modal with this template
  document.getElementById('templateName').value = tData.name;
  const previewImg = document.getElementById('templatePreviewImg');
  previewImg.src = tData.imageUrl;
  previewImg.classList.remove('hidden');

  fields = tData.fields ? JSON.parse(JSON.stringify(tData.fields)) : [];
  fieldIdCounter = fields.length + 1;

  selectedTemplateFile = null; // will use existing URL
  window._existingTemplateUrl = tData.imageUrl;
  window._existingTemplateNaturalW = tData.naturalWidth || 1080;
  window._existingTemplateNaturalH = tData.naturalHeight || 1080;

  document.getElementById('fieldEditorWrap').classList.remove('hidden');
  document.getElementById('saveTemplateBtn').disabled = false;
  document.getElementById('uploadModal').classList.remove('hidden');

  setupCanvas(tData.imageUrl, tData.naturalWidth, tData.naturalHeight);
};

window.closeEditModal = function () {
  document.getElementById('editModal').classList.add('hidden');
};
window.openFieldEditorForEdit = function () { };

// =================== UPLOAD MODAL ===================

window.openUploadModal = function () {
  editingTemplateId = null;
  fields = [];
  fieldIdCounter = 0;
  selectedFieldId = null;
  selectedTemplateFile = null;
  window._existingTemplateUrl = null;
  document.getElementById('templateName').value = '';
  document.getElementById('templatePreviewImg').classList.add('hidden');
  document.getElementById('templatePreviewImg').src = '';
  document.getElementById('fieldEditorWrap').classList.add('hidden');
  document.getElementById('saveTemplateBtn').disabled = true;
  document.getElementById('fieldsList').innerHTML = '';
  document.getElementById('fieldTypePanel').classList.add('hidden');
  document.getElementById('uploadModal').classList.remove('hidden');
};

window.closeUploadModal = function () {
  document.getElementById('uploadModal').classList.add('hidden');
};

window.handleTemplateImageSelect = function (e) {
  const file = e.target.files[0];
  if (!file) return;
  selectedTemplateFile = file;
  const url = URL.createObjectURL(file);
  const img = document.getElementById('templatePreviewImg');
  img.src = url;
  img.classList.remove('hidden');
  img.onload = () => {
    window._existingTemplateNaturalW = img.naturalWidth;
    window._existingTemplateNaturalH = img.naturalHeight;
    document.getElementById('fieldEditorWrap').classList.remove('hidden');
    document.getElementById('saveTemplateBtn').disabled = false;
    setupCanvas(url, img.naturalWidth, img.naturalHeight);
  };
};

// =================== CANVAS / FIELD EDITOR ===================

function setupCanvas(imgUrl, natW, natH) {
  const canvas = document.getElementById('fieldCanvas');
  const canvasImg = document.getElementById('canvasImg');
  canvasImg.src = imgUrl;
  canvasImg.onload = () => {
    canvasScale = canvasImg.clientWidth / natW;
    // Clear old boxes
    document.querySelectorAll('.field-box').forEach(b => b.remove());
    // Re-render existing fields
    fields.forEach(f => renderFieldBox(f));
    updateFieldsList();
  };
  if (canvasImg.complete) {
    canvasScale = canvasImg.clientWidth / (natW || canvasImg.naturalWidth);
    document.querySelectorAll('.field-box').forEach(b => b.remove());
    fields.forEach(f => renderFieldBox(f));
    updateFieldsList();
  }
}

function renderFieldBox(f) {
  const canvas = document.getElementById('fieldCanvas');
  const box = document.createElement('div');
  box.className = 'field-box' + (f.id === selectedFieldId ? ' selected' : '');
  box.dataset.fieldId = f.id;

  const displayX = f.x * canvasScale;
  const displayY = f.y * canvasScale;
  const displayW = f.w * canvasScale;
  const displayH = f.h * canvasScale;

  box.style.cssText = `left:${displayX}px;top:${displayY}px;width:${displayW}px;height:${displayH}px;`;

  const label = document.createElement('div');
  label.className = 'field-box-label';
  label.textContent = f.type ? FIELD_LABELS[f.type] || f.type : '(no type)';
  box.appendChild(label);

  // Resize handles
  ['se', 'sw', 'ne', 'nw'].forEach(dir => {
    const handle = document.createElement('div');
    handle.className = `resize-handle ${dir}`;
    handle.dataset.dir = dir;
    box.appendChild(handle);
  });

  makeDraggable(box, f);
  makeResizable(box, f);

  box.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('resize-handle')) return;
    selectField(f.id);
  });

  canvas.appendChild(box);
}

function selectField(id) {
  selectedFieldId = id;
  document.querySelectorAll('.field-box').forEach(b => b.classList.toggle('selected', b.dataset.fieldId == id));
  document.querySelectorAll('.field-list-item').forEach(b => b.classList.toggle('selected', b.dataset.fieldId == id));

  const f = fields.find(x => x.id == id);
  if (f) {
    document.getElementById('fieldTypePanel').classList.remove('hidden');
    document.getElementById('fieldTypeSelect').value = f.type || '';
    document.getElementById('fieldFontSize').value = f.fontSize || 16;
    document.getElementById('fieldColor').value = f.color || '#ffffff';
    document.getElementById('fieldFontWeight').value = f.fontWeight || '600';
    document.getElementById('fieldTextAlign').value = f.textAlign || 'center';
  }
}

window.addField = function () {
  const f = {
    id: ++fieldIdCounter,
    x: 50, y: 50,
    w: 200, h: 40,
    type: '',
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'center'
  };
  fields.push(f);
  renderFieldBox(f);
  selectField(f.id);
  updateFieldsList();
};

window.deleteSelectedField = function () {
  if (!selectedFieldId) return;
  fields = fields.filter(f => f.id !== selectedFieldId);
  document.querySelector(`.field-box[data-field-id="${selectedFieldId}"]`)?.remove();
  selectedFieldId = null;
  document.getElementById('fieldTypePanel').classList.add('hidden');
  updateFieldsList();
};

window.setFieldType = function (val) {
  const f = fields.find(x => x.id == selectedFieldId);
  if (!f) return;
  f.type = val;
  const box = document.querySelector(`.field-box[data-field-id="${f.id}"]`);
  if (box) box.querySelector('.field-box-label').textContent = val ? FIELD_LABELS[val] || val : '(no type)';
  updateFieldsList();
};

window.setFieldFontSize = function (v) {
  const f = fields.find(x => x.id == selectedFieldId);
  if (f) f.fontSize = parseInt(v);
};
window.setFieldColor = function (v) {
  const f = fields.find(x => x.id == selectedFieldId);
  if (f) f.color = v;
};
window.setFieldFontWeight = function (v) {
  const f = fields.find(x => x.id == selectedFieldId);
  if (f) f.fontWeight = v;
};
window.setFieldTextAlign = function (v) {
  const f = fields.find(x => x.id == selectedFieldId);
  if (f) f.textAlign = v;
};

function updateFieldsList() {
  const list = document.getElementById('fieldsList');
  list.innerHTML = '';
  fields.forEach(f => {
    const item = document.createElement('div');
    item.className = 'field-list-item' + (f.id === selectedFieldId ? ' selected' : '');
    item.dataset.fieldId = f.id;
    item.innerHTML = `
      <span>Field #${f.id}</span>
      <span class="field-list-item-type">${f.type ? (FIELD_LABELS[f.type] || f.type) : 'No type'}</span>
    `;
    item.addEventListener('click', () => selectField(f.id));
    list.appendChild(item);
  });
}

// =================== DRAG & RESIZE ===================

function makeDraggable(box, f) {
  let startX, startY, startLeft, startTop;
  box.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('resize-handle')) return;
    e.preventDefault();
    startX = e.clientX; startY = e.clientY;
    startLeft = parseFloat(box.style.left); startTop = parseFloat(box.style.top);
    function onMove(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newLeft = startLeft + dx;
      const newTop = startTop + dy;
      box.style.left = newLeft + 'px';
      box.style.top = newTop + 'px';
      f.x = newLeft / canvasScale;
      f.y = newTop / canvasScale;
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function makeResizable(box, f) {
  box.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dir = handle.dataset.dir;
      const startX = e.clientX, startY = e.clientY;
      const startW = parseFloat(box.style.width), startH = parseFloat(box.style.height);
      const startLeft = parseFloat(box.style.left), startTop = parseFloat(box.style.top);

      function onMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (dir.includes('e')) { const nw = Math.max(40, startW + dx); box.style.width = nw + 'px'; f.w = nw / canvasScale; }
        if (dir.includes('s')) { const nh = Math.max(20, startH + dy); box.style.height = nh + 'px'; f.h = nh / canvasScale; }
        if (dir.includes('w')) {
          const nw = Math.max(40, startW - dx);
          box.style.width = nw + 'px'; box.style.left = (startLeft + (startW - nw)) + 'px';
          f.w = nw / canvasScale; f.x = parseFloat(box.style.left) / canvasScale;
        }
        if (dir.includes('n')) {
          const nh = Math.max(20, startH - dy);
          box.style.height = nh + 'px'; box.style.top = (startTop + (startH - nh)) + 'px';
          f.h = nh / canvasScale; f.y = parseFloat(box.style.top) / canvasScale;
        }
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// =================== SAVE TEMPLATE ===================

window.saveTemplate = async function () {
  const name = document.getElementById('templateName').value.trim();
  if (!name) { alert('Please enter a template name.'); return; }
  if (!selectedTemplateFile && !window._existingTemplateUrl) { alert('Please upload a background image.'); return; }

  const btn = document.getElementById('saveTemplateBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    let imageUrl = window._existingTemplateUrl;
    let naturalWidth = window._existingTemplateNaturalW || 1080;
    let naturalHeight = window._existingTemplateNaturalH || 1080;

    if (selectedTemplateFile) {
      imageUrl = await uploadToCloudinary(selectedTemplateFile, 'cricsnap/templates');
    }

    const data = {
      userId: currentUser.uid,
      name,
      imageUrl,
      naturalWidth,
      naturalHeight,
      fields: fields.map(f => ({ ...f })),
      updatedAt: Date.now()
    };

    if (editingTemplateId) {
      await updateDoc(doc(db, 'templates', editingTemplateId), data);
    } else {
      data.createdAt = Date.now();
      await addDoc(collection(db, 'templates'), data);
    }

    closeUploadModal();
    loadTemplates();
  } catch (e) {
    alert('Save failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Template';
  }
};

// =================== FIELD LABELS MAP ===================

const FIELD_LABELS = {
  match_title: 'Match Title',
  match_date: 'Match Date',
  match_venue: 'Venue',
  match_result: 'Result',
  man_of_match: 'Man of Match',
  toss_result: 'Toss',
  team1_name: 'Team 1 Name',
  team1_score: 'Team 1 Score',
  team1_overs: 'Team 1 Overs',
  team1_batter1_name: 'T1 Bat#1 Name',
  team1_batter1_runs: 'T1 Bat#1 Runs',
  team1_batter1_balls: 'T1 Bat#1 Balls',
  team1_batter2_name: 'T1 Bat#2 Name',
  team1_batter2_runs: 'T1 Bat#2 Runs',
  team1_batter2_balls: 'T1 Bat#2 Balls',
  team1_batter3_name: 'T1 Bat#3 Name',
  team1_batter3_runs: 'T1 Bat#3 Runs',
  team1_batter3_balls: 'T1 Bat#3 Balls',
  team1_bowler1_name: 'T1 Bowl#1 Name',
  team1_bowler1_wickets: 'T1 Bowl#1 Wkts',
  team1_bowler1_runs: 'T1 Bowl#1 Runs',
  team1_bowler1_overs: 'T1 Bowl#1 Ovrs',
  team1_bowler2_name: 'T1 Bowl#2 Name',
  team1_bowler2_wickets: 'T1 Bowl#2 Wkts',
  team1_bowler2_runs: 'T1 Bowl#2 Runs',
  team1_bowler2_overs: 'T1 Bowl#2 Ovrs',
  team1_bowler3_name: 'T1 Bowl#3 Name',
  team1_bowler3_wickets: 'T1 Bowl#3 Wkts',
  team1_bowler3_runs: 'T1 Bowl#3 Runs',
  team1_bowler3_overs: 'T1 Bowl#3 Ovrs',
  team2_name: 'Team 2 Name',
  team2_score: 'Team 2 Score',
  team2_overs: 'Team 2 Overs',
  team2_batter1_name: 'T2 Bat#1 Name',
  team2_batter1_runs: 'T2 Bat#1 Runs',
  team2_batter1_balls: 'T2 Bat#1 Balls',
  team2_batter2_name: 'T2 Bat#2 Name',
  team2_batter2_runs: 'T2 Bat#2 Runs',
  team2_batter2_balls: 'T2 Bat#2 Balls',
  team2_batter3_name: 'T2 Bat#3 Name',
  team2_batter3_runs: 'T2 Bat#3 Runs',
  team2_batter3_balls: 'T2 Bat#3 Balls',
  team2_bowler1_name: 'T2 Bowl#1 Name',
  team2_bowler1_wickets: 'T2 Bowl#1 Wkts',
  team2_bowler1_runs: 'T2 Bowl#1 Runs',
  team2_bowler1_overs: 'T2 Bowl#1 Ovrs',
  team2_bowler2_name: 'T2 Bowl#2 Name',
  team2_bowler2_wickets: 'T2 Bowl#2 Wkts',
  team2_bowler2_runs: 'T2 Bowl#2 Runs',
  team2_bowler2_overs: 'T2 Bowl#2 Ovrs',
  team2_bowler3_name: 'T2 Bowl#3 Name',
  team2_bowler3_wickets: 'T2 Bowl#3 Wkts',
  team2_bowler3_runs: 'T2 Bowl#3 Runs',
  team2_bowler3_overs: 'T2 Bowl#3 Ovrs',
};
