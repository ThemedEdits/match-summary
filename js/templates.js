import { db } from './firebase-config.js';
import { requireAuth } from './auth-guard.js';
import { uploadToCloudinary } from './cloudinary.js';
import { showToast, showAlert, showConfirm } from './popup.js';
import { initDropdowns, setDropdownValue } from './dropdown.js';
import {
  collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;
let selectedTemplateFile = null;
let fields = [];
let selectedFieldId = null;
let fieldIdCounter = 0;
let canvasScale = 1;
let editingTemplateId = null;
let availableFonts = [];

requireAuth(async (user) => {
  currentUser = user;
  await loadAvailableFonts();
  loadTemplates();
  // Wire up select change handlers (works with both native and custom dropdowns)
  wireSelectHandlers();
});

function wireSelectHandlers() {
  const wire = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', (e) => fn(e.target.value));
  };
  wire('fieldTypeSelect', (v) => window.setFieldType(v));
  wire('fieldFontFamily', (v) => window.setFieldFontFamily(v));
  wire('fieldFontSize', (v) => window.setFieldFontSize(v));
  wire('fieldFontWeight', (v) => window.setFieldFontWeight(v));
  wire('fieldTextAlign', (v) => window.setFieldTextAlign(v));
  wire('fieldColor', (v) => window.setFieldColor(v));
}

// =================== FONT FOLDER LOADER ===================

async function loadAvailableFonts() {
  try {
    const res = await fetch('../fonts/fonts.json');
    if (!res.ok) return;
    const fonts = await res.json();
    availableFonts = fonts;

    for (const font of fonts) {
      try {
        if (!document.fonts.check(`12px "${font.name}"`)) {
          const ff = new FontFace(font.name, `url(${font.url})`);
          await ff.load();
          document.fonts.add(ff);
        }
      } catch (_) {}
    }

    const sel = document.getElementById('fieldFontFamily');
    if (!sel || fonts.length === 0) return;

    const group = document.createElement('optgroup');
    group.label = 'Custom Fonts (from /fonts folder)';
    fonts.forEach(font => {
      const opt = document.createElement('option');
      opt.value = font.name;
      opt.textContent = font.name;
      opt.dataset.custom = '1';
      group.appendChild(opt);
    });
    sel.insertBefore(group, sel.firstChild);
    // Re-init dropdown to pick up new options
    sel.removeAttribute('data-cs-dropdown-init');
    initDropdowns(sel.closest('.field-type-panel') || document);
  } catch (_) {}
}

// =================== TEMPLATES LIST ===================

async function loadTemplates() {
  const grid = document.getElementById('templateGrid');
  if (!grid) return;
  grid.innerHTML = `<div style="color:var(--muted);font-size:14px;padding:20px 0;display:flex;align-items:center;gap:8px"><i data-lucide="loader-2" class="spin"></i> Loading templates...</div>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  try {
    const snap = await getDocs(query(collection(db, 'templates'), where('userId', '==', currentUser.uid)));
    if (snap.empty) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="image-off"></i></div><p>No templates yet. Upload your first background!</p></div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }
    grid.innerHTML = '';
    snap.forEach(d => {
      const t = { id: d.id, ...d.data() };
      const card = document.createElement('div');
      card.className = 'template-card reveal';
      card.innerHTML = `
        <img class="template-card-img" src="${t.imageUrl}" alt="${t.name}" />
        <div class="template-card-body">
          <div class="template-card-name">${t.name}</div>
          <div class="template-card-meta">${t.fields?.length || 0} fields · ${t.customFonts?.length || 0} fonts</div>
          <div class="template-card-actions">
            <button class="btn-sm" onclick="editTemplate('${t.id}')"><i data-lucide="pencil"></i> Edit</button>
            <button class="btn-sm danger" onclick="deleteTemplate('${t.id}', '${t.name.replace(/'/g, "\\'")}')"><i data-lucide="trash-2"></i></button>
          </div>
        </div>`;
      grid.appendChild(card);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (e) {
    grid.innerHTML = `<div class="empty-state"><p>Could not load templates.</p></div>`;
    showToast('Could not load templates — check Firestore rules.', 'danger');
  }
}

window.deleteTemplate = async function (id, name) {
  const confirmed = await showConfirm(`Delete "${name}"?`, 'This will permanently remove the template and all its field settings.', 'Delete Template');
  if (!confirmed) return;
  try {
    await deleteDoc(doc(db, 'templates', id));
    showToast(`"${name}" deleted.`, 'success');
    loadTemplates();
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'danger');
  }
};

window.editTemplate = async function (id) {
  editingTemplateId = id;
  try {
    const snap = await getDocs(query(collection(db, 'templates'), where('userId', '==', currentUser.uid)));
    let tData = null;
    snap.forEach(d => { if (d.id === id) tData = { id: d.id, ...d.data() }; });
    if (!tData) return;

    document.getElementById('modalTitle').textContent = 'Edit Template';
    document.getElementById('templateName').value = tData.name;
    fields = tData.fields ? JSON.parse(JSON.stringify(tData.fields)) : [];
    fieldIdCounter = Math.max(0, ...fields.map(f => f.id || 0)) + 1;
    selectedTemplateFile = null;
    window._existingTemplateUrl = tData.imageUrl;
    window._existingTemplateNaturalW = tData.naturalWidth || 1080;
    window._existingTemplateNaturalH = tData.naturalHeight || 1080;

    document.getElementById('fieldEditorWrap').classList.remove('hidden');
    document.getElementById('canvasPlaceholder').classList.add('hidden');
    document.getElementById('saveTemplateBtn').disabled = false;
    document.getElementById('uploadModal').classList.remove('hidden');

    // Update upload zone label
    document.getElementById('templateUploadZone').querySelector('span').textContent = 'Change background image';

    setupCanvas(tData.imageUrl, tData.naturalWidth, tData.naturalHeight);
    if (tData.customFonts?.length) restoreSavedFonts(tData.customFonts);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (e) {
    showToast('Could not load template data.', 'danger');
  }
};

// =================== UPLOAD MODAL ===================

window.openUploadModal = function () {
  editingTemplateId = null;
  fields = [];
  fieldIdCounter = 0;
  selectedFieldId = null;
  selectedTemplateFile = null;
  window._existingTemplateUrl = null;

  document.getElementById('modalTitle').textContent = 'New Template';
  document.getElementById('templateName').value = '';
  document.getElementById('fieldEditorWrap').classList.add('hidden');
  document.getElementById('canvasPlaceholder').classList.remove('hidden');
  document.getElementById('saveTemplateBtn').disabled = true;
  document.getElementById('fieldsList').innerHTML = '';
  document.getElementById('fieldTypePanel').classList.add('hidden');
  document.getElementById('templateUploadZone').querySelector('span').textContent = 'Upload background image';
  document.getElementById('templateUploadZone').style.borderColor = '';
  document.querySelectorAll('.field-box').forEach(b => b.remove());
  const img = document.getElementById('canvasImg');
  if (img) img.src = '';
  document.getElementById('uploadModal').classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
  setTimeout(() => initDropdowns(document.getElementById('uploadModal')), 50);
};

window.closeUploadModal = function () {
  document.getElementById('uploadModal').classList.add('hidden');
};

window.handleTemplateImageSelect = function (e) {
  const file = e.target.files[0];
  if (!file) return;
  selectedTemplateFile = file;
  const url = URL.createObjectURL(file);
  const img = document.getElementById('canvasImg');
  img.onload = () => {
    window._existingTemplateNaturalW = img.naturalWidth;
    window._existingTemplateNaturalH = img.naturalHeight;
    document.getElementById('fieldEditorWrap').classList.remove('hidden');
    document.getElementById('canvasPlaceholder').classList.add('hidden');
    document.getElementById('saveTemplateBtn').disabled = false;
    const zone = document.getElementById('templateUploadZone');
    zone.querySelector('span').textContent = file.name;
    zone.style.borderColor = 'var(--green)';
    setupCanvas(url, img.naturalWidth, img.naturalHeight);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  };
  img.src = url;
};

// =================== CANVAS ===================

function setupCanvas(imgUrl, natW, natH) {
  const canvasImg = document.getElementById('canvasImg');
  const doSetup = () => {
    canvasScale = canvasImg.clientWidth / (natW || canvasImg.naturalWidth || 1);
    document.querySelectorAll('.field-box').forEach(b => b.remove());
    fields.forEach(f => renderFieldBox(f));
    updateFieldsList();
  };
  canvasImg.src = imgUrl;
  if (canvasImg.complete && canvasImg.naturalWidth) doSetup();
  else canvasImg.onload = doSetup;
}

function renderFieldBox(f) {
  const canvas = document.getElementById('fieldCanvas');
  const box = document.createElement('div');
  box.className = 'field-box' + (f.id === selectedFieldId ? ' selected' : '');
  box.dataset.fieldId = f.id;
  box.style.cssText = `left:${f.x*canvasScale}px;top:${f.y*canvasScale}px;width:${f.w*canvasScale}px;height:${f.h*canvasScale}px;`;
  const label = document.createElement('div');
  label.className = 'field-box-label';
  label.textContent = f.type ? (FIELD_LABELS[f.type] || f.type) : '(no type)';
  box.appendChild(label);
  ['se','sw','ne','nw'].forEach(dir => {
    const h = document.createElement('div');
    h.className = `resize-handle ${dir}`;
    h.dataset.dir = dir;
    box.appendChild(h);
  });
  makeDraggable(box, f);
  makeResizable(box, f);
  box.addEventListener('mousedown', (e) => { if (!e.target.classList.contains('resize-handle')) selectField(f.id); });
  canvas.appendChild(box);
}

function selectField(id) {
  selectedFieldId = id;
  document.querySelectorAll('.field-box').forEach(b => b.classList.toggle('selected', b.dataset.fieldId == id));
  document.querySelectorAll('.field-list-item').forEach(b => b.classList.toggle('selected', b.dataset.fieldId == id));
  const f = fields.find(x => x.id == id);
  if (!f) return;
  document.getElementById('fieldTypePanel').classList.remove('hidden');
  document.getElementById('fieldTypeSelect').value = f.type || '';
  document.getElementById('fieldFontSize').value = f.fontSize || 16;
  document.getElementById('fieldColor').value = f.color || '#ffffff';
  document.getElementById('fieldColorHex').value = f.color || '#ffffff';
  document.getElementById('fieldFontWeight').value = f.fontWeight || '600';
  document.getElementById('fieldTextAlign').value = f.textAlign || 'center';
  const sel = document.getElementById('fieldFontFamily');
  const targetFont = (f.fontFamily && [...sel.options].some(o => o.value === f.fontFamily)) ? f.fontFamily : 'DM Sans';
  sel.value = targetFont;
  setDropdownValue(sel, targetFont);
  setDropdownValue(document.getElementById('fieldFontWeight'), f.fontWeight || '600');
  setDropdownValue(document.getElementById('fieldTextAlign'), f.textAlign || 'center');
}

window.addField = function () {
  const f = { id: ++fieldIdCounter, x:40, y:40, w:200, h:44, type:'', fontFamily:'DM Sans', fontSize:18, color:'#ffffff', fontWeight:'600', textAlign:'center' };
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
  if (box) box.querySelector('.field-box-label').textContent = val ? (FIELD_LABELS[val]||val) : '(no type)';
  updateFieldsList();
};
window.setFieldFontFamily = (v) => { const f = fields.find(x=>x.id==selectedFieldId); if(f) f.fontFamily=v; };
window.setFieldFontSize = (v) => { const f = fields.find(x=>x.id==selectedFieldId); if(f) f.fontSize=parseInt(v); };
window.setFieldColor = (v) => { const f = fields.find(x=>x.id==selectedFieldId); if(f){f.color=v; document.getElementById('fieldColorHex').value=v;} };
window.setFieldColorFromHex = (v) => { if(/^#[0-9a-fA-F]{6}$/.test(v)){const f=fields.find(x=>x.id==selectedFieldId);if(f){f.color=v;document.getElementById('fieldColor').value=v;}} };
window.setFieldFontWeight = (v) => { const f = fields.find(x=>x.id==selectedFieldId); if(f) f.fontWeight=v; };
window.setFieldTextAlign = (v) => { const f = fields.find(x=>x.id==selectedFieldId); if(f) f.textAlign=v; };

function updateFieldsList() {
  const list = document.getElementById('fieldsList');
  if (!list) return;
  if (fields.length === 0) { list.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0">No fields yet. Click + Add Field.</div>'; return; }
  list.innerHTML = '';
  fields.forEach(f => {
    const item = document.createElement('div');
    item.className = 'field-list-item' + (f.id===selectedFieldId?' selected':'');
    item.dataset.fieldId = f.id;
    item.innerHTML = `<span>Field #${f.id}</span><span class="field-list-item-type">${f.type?(FIELD_LABELS[f.type]||f.type):'No type'}</span>`;
    item.addEventListener('click', () => selectField(f.id));
    list.appendChild(item);
  });
}

// =================== DRAG & RESIZE ===================

function makeDraggable(box, f) {
  box.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('resize-handle')) return;
    e.preventDefault();
    const sx=e.clientX, sy=e.clientY, sl=parseFloat(box.style.left), st=parseFloat(box.style.top);
    const mv=(e)=>{ box.style.left=(sl+e.clientX-sx)+'px'; box.style.top=(st+e.clientY-sy)+'px'; f.x=parseFloat(box.style.left)/canvasScale; f.y=parseFloat(box.style.top)/canvasScale; };
    const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
    document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
  });
}

function makeResizable(box, f) {
  box.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const dir=handle.dataset.dir, sx=e.clientX, sy=e.clientY;
      const sw=parseFloat(box.style.width), sh=parseFloat(box.style.height), sl=parseFloat(box.style.left), st=parseFloat(box.style.top);
      const mv=(e)=>{
        const dx=e.clientX-sx, dy=e.clientY-sy;
        if(dir.includes('e')){const nw=Math.max(40,sw+dx);box.style.width=nw+'px';f.w=nw/canvasScale;}
        if(dir.includes('s')){const nh=Math.max(20,sh+dy);box.style.height=nh+'px';f.h=nh/canvasScale;}
        if(dir.includes('w')){const nw=Math.max(40,sw-dx);box.style.width=nw+'px';box.style.left=(sl+sw-nw)+'px';f.w=nw/canvasScale;f.x=parseFloat(box.style.left)/canvasScale;}
        if(dir.includes('n')){const nh=Math.max(20,sh-dy);box.style.height=nh+'px';box.style.top=(st+sh-nh)+'px';f.h=nh/canvasScale;f.y=parseFloat(box.style.top)/canvasScale;}
      };
      const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
      document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
    });
  });
}

// =================== SAVE ===================

window.saveTemplate = async function () {
  const name = document.getElementById('templateName').value.trim();
  if (!name) { await showAlert('Name Required', 'Please enter a template name before saving.', 'warning'); return; }
  if (!selectedTemplateFile && !window._existingTemplateUrl) { await showAlert('No Image', 'Please upload a background image first.', 'warning'); return; }

  const btn = document.getElementById('saveTemplateBtn');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Saving...';
  if (typeof lucide !== 'undefined') lucide.createIcons();

  try {
    let imageUrl = window._existingTemplateUrl;
    const naturalWidth = window._existingTemplateNaturalW || 1080;
    const naturalHeight = window._existingTemplateNaturalH || 1080;
    if (selectedTemplateFile) imageUrl = await uploadToCloudinary(selectedTemplateFile, 'cricsnap/templates');

    const usedFontNames = [...new Set(fields.map(f=>f.fontFamily).filter(Boolean))];
    const customFonts = availableFonts.filter(f=>usedFontNames.includes(f.name)).map(f=>({name:f.name, url:f.url}));

    const data = { userId:currentUser.uid, name, imageUrl, naturalWidth, naturalHeight, fields:fields.map(f=>({...f})), customFonts, updatedAt:Date.now() };

    if (editingTemplateId) {
      await updateDoc(doc(db,'templates',editingTemplateId), data);
      showToast(`"${name}" updated!`, 'success');
    } else {
      data.createdAt = Date.now();
      await addDoc(collection(db,'templates'), data);
      showToast(`"${name}" saved!`, 'success');
    }
    closeUploadModal();
    loadTemplates();
  } catch (e) {
    showToast('Save failed: ' + e.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="save"></i> Save Template';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
};

async function restoreSavedFonts(savedFonts) {
  for (const {name,url} of savedFonts) {
    try {
      if (!document.fonts.check(`12px "${name}"`)) { const ff=new FontFace(name,`url(${url})`); await ff.load(); document.fonts.add(ff); }
    } catch(_) {}
  }
}

const FIELD_LABELS = {
  match_title:'Match Title',match_date:'Match Date',match_venue:'Venue',match_result:'Result',man_of_match:'Man of Match',toss_result:'Toss',
  team1_name:'Team 1 Name',team1_score:'Team 1 Score',team1_overs:'Team 1 Overs',
  team1_batter1_name:'T1 Bat#1 Name',team1_batter1_runs:'T1 Bat#1 Runs',team1_batter1_balls:'T1 Bat#1 Balls',
  team1_batter2_name:'T1 Bat#2 Name',team1_batter2_runs:'T1 Bat#2 Runs',team1_batter2_balls:'T1 Bat#2 Balls',
  team1_batter3_name:'T1 Bat#3 Name',team1_batter3_runs:'T1 Bat#3 Runs',team1_batter3_balls:'T1 Bat#3 Balls',
  team1_bowler1_name:'T1 Bowl#1 Name',team1_bowler1_wickets:'T1 Bowl#1 Wkts',team1_bowler1_runs:'T1 Bowl#1 Runs',team1_bowler1_overs:'T1 Bowl#1 Ovrs',
  team1_bowler2_name:'T1 Bowl#2 Name',team1_bowler2_wickets:'T1 Bowl#2 Wkts',team1_bowler2_runs:'T1 Bowl#2 Runs',team1_bowler2_overs:'T1 Bowl#2 Ovrs',
  team1_bowler3_name:'T1 Bowl#3 Name',team1_bowler3_wickets:'T1 Bowl#3 Wkts',team1_bowler3_runs:'T1 Bowl#3 Runs',team1_bowler3_overs:'T1 Bowl#3 Ovrs',
  team2_name:'Team 2 Name',team2_score:'Team 2 Score',team2_overs:'Team 2 Overs',
  team2_batter1_name:'T2 Bat#1 Name',team2_batter1_runs:'T2 Bat#1 Runs',team2_batter1_balls:'T2 Bat#1 Balls',
  team2_batter2_name:'T2 Bat#2 Name',team2_batter2_runs:'T2 Bat#2 Runs',team2_batter2_balls:'T2 Bat#2 Balls',
  team2_batter3_name:'T2 Bat#3 Name',team2_batter3_runs:'T2 Bat#3 Runs',team2_batter3_balls:'T2 Bat#3 Balls',
  team2_bowler1_name:'T2 Bowl#1 Name',team2_bowler1_wickets:'T2 Bowl#1 Wkts',team2_bowler1_runs:'T2 Bowl#1 Runs',team2_bowler1_overs:'T2 Bowl#1 Ovrs',
  team2_bowler2_name:'T2 Bowl#2 Name',team2_bowler2_wickets:'T2 Bowl#2 Wkts',team2_bowler2_runs:'T2 Bowl#2 Runs',team2_bowler2_overs:'T2 Bowl#2 Ovrs',
  team2_bowler3_name:'T2 Bowl#3 Name',team2_bowler3_wickets:'T2 Bowl#3 Wkts',team2_bowler3_runs:'T2 Bowl#3 Runs',team2_bowler3_overs:'T2 Bowl#3 Ovrs',
};