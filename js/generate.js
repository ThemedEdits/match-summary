import { db } from './firebase-config.js';
import { requireAuth } from './auth-guard.js';
import { uploadCanvasToCloudinary } from './cloudinary.js';
import {
  collection, addDoc, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// =================== ANTHROPIC CONFIG ===================
// Option A (Recommended / Production):
//   Deploy to Vercel and set ANTHROPIC_API_KEY as an environment variable.
//   The /api/analyze.js serverless function will proxy the request securely.
//   Set USE_PROXY = true below.
//
// Option B (Local testing only):
//   Paste your key directly. Never commit this to Git.
//   Set USE_PROXY = false and fill in ANTHROPIC_API_KEY.

const USE_PROXY = true; // true = use /api/analyze (Vercel), false = direct browser call
const ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY'; // only needed if USE_PROXY = false

let currentUser = null;
let scorecardFile = null;
let extractedData = {};
let selectedTemplate = null;
let userTemplates = [];

requireAuth((user) => {
  currentUser = user;
});

// =================== STEP 1: UPLOAD ===================

window.handleScorecardUpload = function (e) {
  const file = e.target.files[0];
  if (!file) return;
  scorecardFile = file;
  const url = URL.createObjectURL(file);
  const preview = document.getElementById('scorecardPreview');
  preview.src = url;
  preview.classList.remove('hidden');

  // Update upload zone
  const zone = document.getElementById('scorecardUploadZone');
  zone.querySelector('p').textContent = file.name;
  zone.querySelector('small').textContent = `${(file.size / 1024).toFixed(1)} KB`;

  document.getElementById('analyzeBtn').disabled = false;
};

// Drag and drop support
const dropZone = document.getElementById('scorecardUploadZone');
if (dropZone) {
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent)'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      document.getElementById('scorecardInput').files = e.dataTransfer.files;
      window.handleScorecardUpload({ target: { files: [file] } });
    }
  });
}

// =================== STEP 2: AI ANALYSIS ===================

window.analyzeScorecard = async function () {
  if (!scorecardFile) return;

  showLoader('Reading the scorecard image...');

  try {
    // Convert file to base64
    const base64 = await fileToBase64(scorecardFile);
    const mimeType = scorecardFile.type || 'image/png';

    updateLoaderStatus('Sending to Claude AI...');

    const prompt = `You are a cricket scorecard analyzer. Carefully read this scorecard image and extract ALL data. Return ONLY a valid JSON object with no extra text, no markdown, no backticks.

The JSON must follow this exact structure:
{
  "match_title": "Series/League name and match",
  "match_date": "date string",
  "match_venue": "venue location",
  "match_result": "full result e.g. Sheheryar Sports won by 7 wickets",
  "man_of_match": "player name (team)",
  "toss_result": "who won toss and chose to do what",
  "team1_name": "name of team that batted first",
  "team1_score": "runs/wickets e.g. 127/8",
  "team1_overs": "overs e.g. 20.0",
  "team1_batter1_name": "top scorer name",
  "team1_batter1_runs": "runs as number",
  "team1_batter1_balls": "balls as number",
  "team1_batter2_name": "",
  "team1_batter2_runs": "",
  "team1_batter2_balls": "",
  "team1_batter3_name": "",
  "team1_batter3_runs": "",
  "team1_batter3_balls": "",
  "team1_bowler1_name": "best bowler for this team (most wickets, best economy)",
  "team1_bowler1_wickets": "",
  "team1_bowler1_runs": "",
  "team1_bowler1_overs": "",
  "team1_bowler2_name": "",
  "team1_bowler2_wickets": "",
  "team1_bowler2_runs": "",
  "team1_bowler2_overs": "",
  "team1_bowler3_name": "",
  "team1_bowler3_wickets": "",
  "team1_bowler3_runs": "",
  "team1_bowler3_overs": "",
  "team2_name": "name of team that batted second",
  "team2_score": "",
  "team2_overs": "",
  "team2_batter1_name": "",
  "team2_batter1_runs": "",
  "team2_batter1_balls": "",
  "team2_batter2_name": "",
  "team2_batter2_runs": "",
  "team2_batter2_balls": "",
  "team2_batter3_name": "",
  "team2_batter3_runs": "",
  "team2_batter3_balls": "",
  "team2_bowler1_name": "",
  "team2_bowler1_wickets": "",
  "team2_bowler1_runs": "",
  "team2_bowler1_overs": "",
  "team2_bowler2_name": "",
  "team2_bowler2_wickets": "",
  "team2_bowler2_runs": "",
  "team2_bowler2_overs": "",
  "team2_bowler3_name": "",
  "team2_bowler3_wickets": "",
  "team2_bowler3_runs": "",
  "team2_bowler3_overs": ""
}

For top batters: sort by runs scored descending. Pick top 3.
For top bowlers per team: these are the OPPONENT team's bowlers (bowlers who bowled AGAINST this team). Sort by wickets descending, then economy ascending. Pick top 3.
Leave fields as empty string "" if not found.`;

    updateLoaderStatus('Claude is reading batting stats...');

    const apiUrl = USE_PROXY ? '/api/analyze' : 'https://api.anthropic.com/v1/messages';
    const apiHeaders = USE_PROXY
      ? { 'Content-Type': 'application/json' }
      : {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    updateLoaderStatus('Parsing match data...');

    const result = await response.json();
    const rawText = result.content?.[0]?.text || '{}';
    // Strip any markdown if present
    const cleanText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    extractedData = JSON.parse(cleanText);

    hideLoader();
    showExtractedDataForm(extractedData);

  } catch (e) {
    hideLoader();
    alert('AI analysis failed: ' + e.message + '\n\nMake sure your Anthropic API key is set in js/generate.js');
    console.error(e);
  }
};

function showExtractedDataForm(data) {
  const form = document.getElementById('extractedDataForm');
  form.innerHTML = '';

  const fields = [
    { section: 'Match Info' },
    { key: 'match_title', label: 'Match Title' },
    { key: 'match_date', label: 'Match Date' },
    { key: 'match_venue', label: 'Venue' },
    { key: 'match_result', label: 'Result' },
    { key: 'man_of_match', label: 'Man of Match' },
    { key: 'toss_result', label: 'Toss' },
    { section: '1st Innings — Batting' },
    { key: 'team1_name', label: 'Team 1 Name' },
    { key: 'team1_score', label: 'Team 1 Score' },
    { key: 'team1_overs', label: 'Team 1 Overs' },
    { key: 'team1_batter1_name', label: 'Batter #1 Name' },
    { key: 'team1_batter1_runs', label: 'Batter #1 Runs' },
    { key: 'team1_batter1_balls', label: 'Batter #1 Balls' },
    { key: 'team1_batter2_name', label: 'Batter #2 Name' },
    { key: 'team1_batter2_runs', label: 'Batter #2 Runs' },
    { key: 'team1_batter2_balls', label: 'Batter #2 Balls' },
    { key: 'team1_batter3_name', label: 'Batter #3 Name' },
    { key: 'team1_batter3_runs', label: 'Batter #3 Runs' },
    { key: 'team1_batter3_balls', label: 'Batter #3 Balls' },
    { section: '1st Innings — Bowling' },
    { key: 'team1_bowler1_name', label: 'Bowler #1 Name' },
    { key: 'team1_bowler1_wickets', label: 'Bowler #1 Wkts' },
    { key: 'team1_bowler1_runs', label: 'Bowler #1 Runs' },
    { key: 'team1_bowler1_overs', label: 'Bowler #1 Overs' },
    { key: 'team1_bowler2_name', label: 'Bowler #2 Name' },
    { key: 'team1_bowler2_wickets', label: 'Bowler #2 Wkts' },
    { key: 'team1_bowler2_runs', label: 'Bowler #2 Runs' },
    { key: 'team1_bowler2_overs', label: 'Bowler #2 Overs' },
    { key: 'team1_bowler3_name', label: 'Bowler #3 Name' },
    { key: 'team1_bowler3_wickets', label: 'Bowler #3 Wkts' },
    { key: 'team1_bowler3_runs', label: 'Bowler #3 Runs' },
    { key: 'team1_bowler3_overs', label: 'Bowler #3 Overs' },
    { section: '2nd Innings — Batting' },
    { key: 'team2_name', label: 'Team 2 Name' },
    { key: 'team2_score', label: 'Team 2 Score' },
    { key: 'team2_overs', label: 'Team 2 Overs' },
    { key: 'team2_batter1_name', label: 'Batter #1 Name' },
    { key: 'team2_batter1_runs', label: 'Batter #1 Runs' },
    { key: 'team2_batter1_balls', label: 'Batter #1 Balls' },
    { key: 'team2_batter2_name', label: 'Batter #2 Name' },
    { key: 'team2_batter2_runs', label: 'Batter #2 Runs' },
    { key: 'team2_batter2_balls', label: 'Batter #2 Balls' },
    { key: 'team2_batter3_name', label: 'Batter #3 Name' },
    { key: 'team2_batter3_runs', label: 'Batter #3 Runs' },
    { key: 'team2_batter3_balls', label: 'Batter #3 Balls' },
    { section: '2nd Innings — Bowling' },
    { key: 'team2_bowler1_name', label: 'Bowler #1 Name' },
    { key: 'team2_bowler1_wickets', label: 'Bowler #1 Wkts' },
    { key: 'team2_bowler1_runs', label: 'Bowler #1 Runs' },
    { key: 'team2_bowler1_overs', label: 'Bowler #1 Overs' },
    { key: 'team2_bowler2_name', label: 'Bowler #2 Name' },
    { key: 'team2_bowler2_wickets', label: 'Bowler #2 Wkts' },
    { key: 'team2_bowler2_runs', label: 'Bowler #2 Runs' },
    { key: 'team2_bowler2_overs', label: 'Bowler #2 Overs' },
    { key: 'team2_bowler3_name', label: 'Bowler #3 Name' },
    { key: 'team2_bowler3_wickets', label: 'Bowler #3 Wkts' },
    { key: 'team2_bowler3_runs', label: 'Bowler #3 Runs' },
    { key: 'team2_bowler3_overs', label: 'Bowler #3 Overs' },
  ];

  fields.forEach(f => {
    if (f.section) {
      const sec = document.createElement('div');
      sec.className = 'data-section';
      sec.innerHTML = `<div class="data-section-title">${f.section}</div>`;
      form.appendChild(sec);
    } else {
      const group = document.createElement('div');
      group.className = 'input-group';
      group.innerHTML = `
        <label>${f.label}</label>
        <input type="text" id="field_${f.key}" value="${data[f.key] || ''}" oninput="extractedData['${f.key}'] = this.value" />
      `;
      form.appendChild(group);
    }
  });

  document.getElementById('step2Card').classList.remove('hidden');
  document.getElementById('step2Card').scrollIntoView({ behavior: 'smooth' });
}

// =================== STEP 3: TEMPLATE ===================

window.proceedToTemplate = async function () {
  // Sync form values to extractedData
  document.querySelectorAll('#extractedDataForm input').forEach(inp => {
    const key = inp.id.replace('field_', '');
    extractedData[key] = inp.value;
  });

  document.getElementById('step3Card').classList.remove('hidden');
  document.getElementById('step3Card').scrollIntoView({ behavior: 'smooth' });
  await loadUserTemplates();
};

async function loadUserTemplates() {
  const grid = document.getElementById('templateSelectGrid');
  grid.innerHTML = '<div class="loading-templates">Loading your templates...</div>';
  try {
    const snap = await getDocs(query(collection(db, 'templates'), where('userId', '==', currentUser.uid)));
    userTemplates = [];
    snap.forEach(d => userTemplates.push({ id: d.id, ...d.data() }));

    grid.innerHTML = '';
    if (userTemplates.length === 0) {
      grid.innerHTML = '<p style="color:var(--muted);font-size:14px;">No templates yet. <a href="templates.html" style="color:var(--accent)">Create one</a> or use plain card below.</p>';
      selectedTemplate = null;
      document.getElementById('generateFinalBtn').disabled = false;
      return;
    }

    userTemplates.forEach(t => {
      const item = document.createElement('div');
      item.className = 'template-select-item';
      item.dataset.templateId = t.id;
      item.innerHTML = `
        <img src="${t.imageUrl}" alt="${t.name}" />
        <div class="template-select-item-name">${t.name}</div>
      `;
      item.addEventListener('click', () => {
        document.querySelectorAll('.template-select-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        document.getElementById('noTemplateOpt').checked = false;
        selectTemplate(t);
      });
      grid.appendChild(item);
    });

    // Auto-select first
    if (userTemplates.length > 0) {
      grid.querySelector('.template-select-item').classList.add('selected');
      selectTemplate(userTemplates[0]);
    }
  } catch (e) {
    grid.innerHTML = '<p style="color:var(--muted);">Could not load templates.</p>';
  }
}

window.selectTemplate = function (t) {
  selectedTemplate = t;
  document.getElementById('generateFinalBtn').disabled = false;
};

// =================== STEP 4: GENERATE CARD ===================

window.generateFinal = async function () {
  showLoader('Composing your match summary card...');
  updateLoaderStatus('Drawing template...');

  try {
    const canvas = document.getElementById('previewCanvas');
    const ctx = canvas.getContext('2d');

    if (selectedTemplate) {
      await renderWithTemplate(canvas, ctx, selectedTemplate, extractedData);
    } else {
      renderPlainCard(canvas, ctx, extractedData);
    }

    hideLoader();
    document.getElementById('step4Card').classList.remove('hidden');
    document.getElementById('step4Card').scrollIntoView({ behavior: 'smooth' });

    // Save to Firestore in background
    saveToHistory(canvas);
  } catch (e) {
    hideLoader();
    alert('Generation failed: ' + e.message);
    console.error(e);
  }
};

async function renderWithTemplate(canvas, ctx, template, data) {
  const natW = template.naturalWidth || 1080;
  const natH = template.naturalHeight || 1080;
  canvas.width = natW;
  canvas.height = natH;

  // Draw background
  const bgImg = await loadImage(template.imageUrl);
  ctx.drawImage(bgImg, 0, 0, natW, natH);

  // Draw each field
  for (const f of (template.fields || [])) {
    if (!f.type || !data[f.type]) continue;
    const text = String(data[f.type]);
    const fontSize = f.fontSize || 16;
    const color = f.color || '#ffffff';
    const weight = f.fontWeight || '600';
    const align = f.textAlign || 'center';

    ctx.save();
    ctx.font = `${weight} ${fontSize}px "DM Sans", sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    // Clip to field area
    ctx.beginPath();
    ctx.rect(f.x, f.y, f.w, f.h);
    ctx.clip();

    let textX = f.x;
    if (align === 'center') textX = f.x + f.w / 2;
    if (align === 'right') textX = f.x + f.w;

    const textY = f.y + f.h / 2;
    ctx.fillText(text, textX, textY, f.w);
    ctx.restore();
  }
}

function renderPlainCard(canvas, ctx, data) {
  const W = 1080, H = 1080;
  canvas.width = W;
  canvas.height = H;

  // Dark background
  ctx.fillStyle = '#0a0f0d';
  ctx.fillRect(0, 0, W, H);

  // Grid pattern
  ctx.strokeStyle = 'rgba(0,200,83,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Header bar
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#00c853');
  grad.addColorStop(1, '#00e676');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 120);

  // Title
  ctx.fillStyle = '#000';
  ctx.font = 'bold 32px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏏 MATCH SUMMARY', W / 2, 52);
  ctx.font = '400 20px "DM Sans", sans-serif';
  ctx.fillText(data.match_title || 'Cricket Match', W / 2, 88);

  // Score Banner
  ctx.fillStyle = '#111816';
  ctx.fillRect(40, 140, W - 80, 100);
  ctx.strokeStyle = 'rgba(0,200,83,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 140, W - 80, 100);

  const t1 = data.team1_name || 'Team 1';
  const t2 = data.team2_name || 'Team 2';
  const s1 = data.team1_score || '-';
  const s2 = data.team2_score || '-';

  ctx.fillStyle = '#f0f4f2';
  ctx.font = 'bold 28px "DM Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(t1, 70, 182);
  ctx.textAlign = 'right';
  ctx.fillText(s1, W - 70, 182);

  ctx.fillStyle = '#7a9088';
  ctx.font = '500 16px "DM Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(data.team1_overs ? `(${data.team1_overs} ov)` : '', 70, 210);

  ctx.fillStyle = '#00e676';
  ctx.font = 'bold 28px "DM Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(t2, 70, 212);

  // Re-draw properly
  ctx.clearRect(0, 140, W, 100);
  ctx.fillStyle = '#111816';
  ctx.fillRect(40, 140, W - 80, 100);
  ctx.strokeStyle = 'rgba(0,200,83,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 140, W - 80, 100);

  // Team 1 row
  ctx.fillStyle = '#f0f4f2';
  ctx.font = 'bold 24px "DM Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(t1, 70, 175);
  ctx.fillStyle = '#00e676';
  ctx.font = 'bold 26px "DM Sans", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(s1, W - 70, 175);

  // Team 2 row
  ctx.fillStyle = '#f0f4f2';
  ctx.font = 'bold 24px "DM Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(t2, 70, 218);
  ctx.fillStyle = '#00e676';
  ctx.font = 'bold 26px "DM Sans", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(s2, W - 70, 218);

  // Result
  ctx.fillStyle = '#ffeb3b';
  ctx.font = '600 18px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.match_result || '', W / 2, 265);

  // MoM
  if (data.man_of_match) {
    ctx.fillStyle = '#00c853';
    ctx.font = '600 16px "DM Sans", sans-serif';
    ctx.fillText(`🏅 Player of Match: ${data.man_of_match}`, W / 2, 295);
  }

  // Two column innings sections
  drawInningsSummary(ctx, data, 'team1', 'BATTING FIRST', 40, 320, 490, H - 360, false);
  drawInningsSummary(ctx, data, 'team2', 'BATTING SECOND', 550, 320, 490, H - 360, false);

  // Footer
  ctx.fillStyle = '#1a2420';
  ctx.fillRect(0, H - 60, W, 60);
  ctx.fillStyle = '#7a9088';
  ctx.font = '400 14px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${data.match_date || ''} • ${data.match_venue || ''} • Generated with CricSnap`, W / 2, H - 26);
}

function drawInningsSummary(ctx, data, prefix, title, x, y, w, h, dark) {
  const p = prefix + '_';
  ctx.fillStyle = '#111816';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,200,83,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  // Section header
  ctx.fillStyle = '#00c853';
  ctx.fillRect(x, y, w, 40);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 16px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title + ': ' + (data[prefix + '_name'] || ''), x + w / 2, y + 24);

  let cy = y + 60;

  // Batters
  ctx.fillStyle = '#7a9088';
  ctx.font = '600 13px "DM Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TOP BATTERS', x + 16, cy);
  cy += 22;

  for (let i = 1; i <= 3; i++) {
    const name = data[p + 'batter' + i + '_name'];
    const runs = data[p + 'batter' + i + '_runs'];
    const balls = data[p + 'batter' + i + '_balls'];
    if (!name) continue;

    ctx.fillStyle = '#f0f4f2';
    ctx.font = '500 14px "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    const shortName = name.length > 18 ? name.substring(0, 17) + '…' : name;
    ctx.fillText(shortName, x + 16, cy);

    if (runs) {
      ctx.fillStyle = '#00e676';
      ctx.font = 'bold 15px "DM Sans", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${runs}${balls ? ` (${balls})` : ''}`, x + w - 16, cy);
    }

    // Separator
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 16, cy + 8);
    ctx.lineTo(x + w - 16, cy + 8);
    ctx.stroke();

    cy += 30;
  }

  cy += 12;

  // Bowlers
  ctx.fillStyle = '#7a9088';
  ctx.font = '600 13px "DM Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TOP BOWLERS', x + 16, cy);
  cy += 22;

  for (let i = 1; i <= 3; i++) {
    const name = data[p + 'bowler' + i + '_name'];
    const wkts = data[p + 'bowler' + i + '_wickets'];
    const runs = data[p + 'bowler' + i + '_runs'];
    const overs = data[p + 'bowler' + i + '_overs'];
    if (!name) continue;

    ctx.fillStyle = '#f0f4f2';
    ctx.font = '500 14px "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    const shortName = name.length > 18 ? name.substring(0, 17) + '…' : name;
    ctx.fillText(shortName, x + 16, cy);

    if (wkts !== undefined || runs) {
      ctx.fillStyle = '#ffeb3b';
      ctx.font = 'bold 14px "DM Sans", sans-serif';
      ctx.textAlign = 'right';
      let stat = '';
      if (wkts) stat += `${wkts}W `;
      if (runs) stat += `${runs}R`;
      if (overs) stat += ` (${overs}ov)`;
      ctx.fillText(stat.trim(), x + w - 16, cy);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 16, cy + 8);
    ctx.lineTo(x + w - 16, cy + 8);
    ctx.stroke();

    cy += 30;
  }
}

// =================== DOWNLOAD ===================

window.downloadCard = function () {
  const canvas = document.getElementById('previewCanvas');
  const link = document.createElement('a');
  const t1 = extractedData.team1_name || 'team1';
  const t2 = extractedData.team2_name || 'team2';
  link.download = `cricsnap-${t1.replace(/\s+/g, '-')}-vs-${t2.replace(/\s+/g, '-')}.png`;
  link.href = canvas.toDataURL('image/png', 1.0);
  link.click();
};

// =================== SAVE TO HISTORY ===================

async function saveToHistory(canvas) {
  try {
    const imageUrl = await uploadCanvasToCloudinary(canvas, 'cricsnap/summaries');
    await addDoc(collection(db, 'summaries'), {
      userId: currentUser.uid,
      matchTitle: extractedData.match_title || 'Match Summary',
      imageUrl,
      data: extractedData,
      templateId: selectedTemplate?.id || null,
      createdAt: Date.now()
    });
  } catch (e) {
    console.warn('Could not save to history:', e.message);
  }
}

// =================== RESET ===================

window.resetGenerator = function () {
  scorecardFile = null;
  extractedData = {};
  selectedTemplate = null;
  document.getElementById('scorecardPreview').classList.add('hidden');
  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('scorecardUploadZone').querySelector('p').textContent = 'Click to upload or drag & drop';
  document.getElementById('scorecardUploadZone').querySelector('small').textContent = 'PNG, JPG, WEBP supported';
  document.getElementById('step2Card').classList.add('hidden');
  document.getElementById('step3Card').classList.add('hidden');
  document.getElementById('step4Card').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// =================== LOADER ===================

function showLoader(msg) {
  document.getElementById('aiLoader').classList.remove('hidden');
  document.getElementById('loaderStatus').textContent = msg;
}

function hideLoader() {
  document.getElementById('aiLoader').classList.add('hidden');
}

window.updateLoaderStatus = function (msg) {
  document.getElementById('loaderStatus').textContent = msg;
};

// =================== UTILS ===================

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image: ' + src));
    img.src = src;
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
