import { db } from './firebase-config.js';
import { requireAuth } from './auth-guard.js';
import { uploadCanvasToCloudinary } from './cloudinary.js';
import {
  collection, addDoc, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast, showAlert } from './popup.js';

// =================== OPENROUTER CONFIG ===================
// OpenRouter is FREE — no credit card needed.
// Free models include Gemini 2.0 Flash, Llama, Mistral and more.
//
// HOW TO GET YOUR FREE KEY (2 minutes):
//   1. Go to https://openrouter.ai
//   2. Sign up with Google or GitHub (free)
//   3. Go to https://openrouter.ai/keys → Click "Create Key"
//   4. Copy the key (looks like: sk-or-v1-...)
//
// Option A (Recommended / Production — key stays secret on Vercel):
//   Set USE_PROXY = true and add OPENROUTER_API_KEY as a Vercel env variable.
//
// Option B (Local Live Server testing):
//   Set USE_PROXY = false and paste your key below.

const USE_PROXY = true; // true = use /api/analyze (Vercel), false = direct browser call
const OPENROUTER_API_KEY = 'YOUR_OPENROUTER_KEY_HERE'; // get free key at openrouter.ai

let currentUser = null;
let scorecardFile = null;
let extractedData = {};
let selectedTemplate = null;
let userTemplates = [];
let topCount = 2; // user-selected: 2, 3, or 4

requireAuth((user) => {
  currentUser = user;
});

window.setTopCount = function(n) {
  topCount = n;
  document.querySelectorAll('.top-count-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.value) === n);
  });
  // If summary already shown, rebuild it with new count
  if (Object.keys(extractedData).length > 0) {
    buildScorecardSummary(extractedData);
  }
};

// =================== STEP 1: UPLOAD ===================

window.handleScorecardUpload = function (e) {
  const file = e.target.files[0];
  if (!file) return;
  scorecardFile = file;
  const url = URL.createObjectURL(file);
  const preview = document.getElementById('scorecardPreview');
  preview.src = url;
  preview.classList.remove('hidden');

  // Hide upload zone and show preview
  const zone = document.getElementById('scorecardUploadZone');
  zone.style.display = 'none';

  document.getElementById('analyzeBtn').disabled = false;
};

// Attach file input change listener (module-safe, no inline onchange needed)
const _scorecardInput = document.getElementById('scorecardInput');
if (_scorecardInput) {
  _scorecardInput.addEventListener('change', (e) => window.handleScorecardUpload(e));
}

// Attach no-template radio listener
const _noTemplateOpt = document.getElementById('noTemplateOpt');
if (_noTemplateOpt) {
  _noTemplateOpt.addEventListener('change', () => window.selectTemplate(null));
}

// Drag and drop support
const dropZone = document.getElementById('scorecardUploadZone');
if (dropZone) {
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
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

    updateLoaderStatus('Sending to Gemini AI...');

    const prompt = `You are a cricket scorecard analyzer. Carefully read this scorecard image and extract ALL data. Return ONLY a valid JSON object with absolutely no extra text, no markdown, no backticks, no explanation.

The JSON must follow this exact structure (fill every field you can find, leave as empty string "" if not found):
{
  "match_title": "Series/League name and match title",
  "match_date": "date string",
  "match_venue": "venue location",
  "match_result": "full result e.g. Sheheryar Sports won by 7 wickets",
  "man_of_match": "player name and team",
  "toss_result": "who won toss and elected to do what",
  "team1_name": "name of team that batted FIRST",
  "team1_score": "runs/wickets e.g. 127/8",
  "team1_overs": "overs e.g. 20.0",
  "team1_batter1_name": "top run scorer name",
  "team1_batter1_runs": "runs as number only",
  "team1_batter1_balls": "balls faced as number only",
  "team1_batter1_notout": "true if not out, false if out",
  "team1_batter2_name": "2nd top run scorer",
  "team1_batter2_runs": "",
  "team1_batter2_balls": "",
  "team1_batter2_notout": "",
  "team1_batter3_name": "3rd top run scorer",
  "team1_batter3_runs": "",
  "team1_batter3_balls": "",
  "team1_batter3_notout": "true if not out, false if out",
  "team1_batter4_name": "4th top run scorer",
  "team1_batter4_runs": "",
  "team1_batter4_balls": "",
  "team1_batter4_notout": "",
  "team1_bowler1_name": "best bowler who bowled AGAINST team1 (most wickets)",
  "team1_bowler1_wickets": "wickets as number only",
  "team1_bowler1_runs": "runs conceded as number only",
  "team1_bowler1_overs": "overs bowled e.g. 4.0 or 3.2",
  "team1_bowler2_name": "2nd best bowler against team1",
  "team1_bowler2_wickets": "",
  "team1_bowler2_runs": "",
  "team1_bowler2_overs": "",
  "team1_bowler3_name": "3rd best bowler against team1",
  "team1_bowler3_wickets": "",
  "team1_bowler3_runs": "",
  "team1_bowler3_overs": "",
  "team1_bowler4_name": "4th best bowler against team1",
  "team1_bowler4_wickets": "",
  "team1_bowler4_runs": "",
  "team1_bowler4_overs": "",
  "team2_name": "name of team that batted SECOND",
  "team2_score": "runs/wickets",
  "team2_overs": "overs",
  "team2_batter1_name": "top run scorer",
  "team2_batter1_runs": "",
  "team2_batter1_balls": "",
  "team2_batter1_notout": "true if not out, false if out",
  "team2_batter2_name": "",
  "team2_batter2_runs": "",
  "team2_batter2_balls": "",
  "team2_batter2_notout": "",
  "team2_batter3_name": "",
  "team2_batter3_runs": "",
  "team2_batter3_balls": "",
  "team2_batter3_notout": "",
  "team2_batter4_name": "",
  "team2_batter4_runs": "",
  "team2_batter4_balls": "",
  "team2_batter4_notout": "",
  "team2_bowler1_name": "best bowler who bowled AGAINST team2 (most wickets)",
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
  "team2_bowler3_overs": "",
  "team2_bowler4_name": "",
  "team2_bowler4_wickets": "",
  "team2_bowler4_runs": "",
  "team2_bowler4_overs": ""
}

BOWLING SORT INSTRUCTIONS — follow this algorithm exactly, do not deviate:
For EACH team's bowling section (the bowlers who bowled against that team):
  1. Write out every single bowler row you see in the image as: NAME | W | R | Overs
  2. Assign a sort key to each: primary = wickets (integer, descending), secondary = economy (R/Overs, ascending, lower is better)
  3. Rank them 1 to N using those keys. The bowler with the MOST wickets is always rank 1. If two bowlers have equal wickets, the one with lower economy is ranked higher.
  4. Place rank-1 bowler into bowler1 fields, rank-2 into bowler2 fields, etc.
  ABSOLUTE RULE: A bowler with MORE wickets must ALWAYS appear before a bowler with FEWER wickets, regardless of runs or economy. 3W always beats 2W. 2W always beats 1W. 1W always beats 0W. No exception.

Other rules:
- Top batters: sort by runs descending, pick top 4 per team.
- notout fields: "true" if batter was NOT OUT, "false" if dismissed.
- overs: full notation e.g. "4.0" or "3.2".
- Names: extract ONLY the player's name. Strip (C), (WK), (c), (wk), captain, wicketkeeper, or any badge/number beside the name.
- Return ONLY the JSON. No text before or after.`;

    updateLoaderStatus('Detecting available Gemini model...');

    let rawText = '';

    if (USE_PROXY) {
      // Vercel proxy route
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType, prompt })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Proxy error ${response.status}`);
      }
      const result = await response.json();
      rawText = result.text || '{}';
    } else {
      // Direct OpenRouter call from browser (free, no CORS issues)
      advanceLoaderStep(2); updateLoaderStatus('Analyzing scorecard with AI...');
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'CricSnap'
        },
        body: JSON.stringify({
          model: 'openrouter/auto',
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
              { type: 'text', text: prompt }
            ]
          }],
          temperature: 0.1,
          max_tokens: 2048
        })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `OpenRouter error ${response.status}`);
      }
      const result = await response.json();
      rawText = result.choices?.[0]?.message?.content || '{}';
    }

    advanceLoaderStep(3); updateLoaderStatus('Parsing match data...');

    const cleanText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    extractedData = JSON.parse(cleanText);

    hideLoader();
    buildScorecardSummary(extractedData);
    showExtractedDataForm(extractedData);

  } catch (e) {
    hideLoader();
    showToast(e.message, 'danger');
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
    showToast('Generation failed: ' + e.message, 'danger');
  }
};

async function renderWithTemplate(canvas, ctx, template, data) {
  const natW = template.naturalWidth || 1080;
  const natH = template.naturalHeight || 1080;
  canvas.width = natW;
  canvas.height = natH;

  // Load any custom fonts stored with the template
  if (template.customFonts && template.customFonts.length) {
    for (const { name, dataUrl } of template.customFonts) {
      try {
        if (!document.fonts.check(`12px "${name}"`)) {
          const ff = new FontFace(name, `url(${dataUrl})`);
          await ff.load();
          document.fonts.add(ff);
        }
      } catch(e) { console.warn('Font load failed:', name); }
    }
    await document.fonts.ready;
  }

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
    const family = f.fontFamily ? `"${f.fontFamily}"` : '"DM Sans", sans-serif';
    ctx.font = `${weight} ${fontSize}px ${family}`;
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
    // History save failed silently
  }
}

// =================== RESET ===================

window.resetGenerator = function () {
  scorecardFile = null;
  extractedData = {};
  selectedTemplate = null;
  document.getElementById('scorecardPreview').classList.add('hidden');
  document.getElementById('scorecardUploadZone').style.display = '';
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

// =================== STRUCTURED SCORECARD SUMMARY ===================

function buildScorecardSummary(d) {
  const el = document.getElementById('scorecardSummary');
  if (!el) return;

  const ic = (name) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${lucideIcon(name)}</svg>`;

  const metaItems = [
    d.match_date  ? `<span class="ss-meta-item">${ic('calendar')} ${d.match_date}</span>` : '',
    d.match_venue ? `<span class="ss-meta-item">${ic('map-pin')} ${d.match_venue}</span>` : '',
    d.toss_result ? `<span class="ss-meta-item">${ic('coins')} ${d.toss_result}</span>` : '',
  ].filter(Boolean).join('');

  // Copy button helper — copies multi-line text to clipboard
  const copyBtn = (id) =>
    `<button class="ss-copy-btn" title="Copy" data-copy-target="${id}">${ic('copy')}</button>`;

  // Strip role badges & junk from player names: (C), (WK), c, wk, numbers
  const cleanName = (raw) => {
    if (!raw) return raw;
    return raw
      .replace(/\s*\(\s*[CcWwKk]+\s*\)/g, '')   // (C) (WK) (c) (wk)
      .replace(/\s*\b(c|wk|captain|wicketkeeper)\b/gi, '')  // standalone labels
      .replace(/\s*#?\d+\s*$/, '')                // trailing numbers
      .replace(/\s{2,}/g, ' ')                    // collapse double spaces
      .trim();
  };

  const teamBlock = (prefix, label) => {
    const p = prefix + '_';
    const n = topCount;

    // Build batter rows
    let batterNames = [], batterRuns = [], batterBalls = [];
    let batterRowsHtml = '';
    for (let i = 1; i <= n; i++) {
      const name  = d[p+'batter'+i+'_name'];
      const runs  = d[p+'batter'+i+'_runs'];
      const balls = d[p+'batter'+i+'_balls'];
      const notout = d[p+'batter'+i+'_notout'];
      if (!name) continue;
      const cleanedBatterName = cleanName(name);
      const runsDisplay = runs ? (notout === 'true' ? runs + '*' : runs) : '—';
      batterNames.push(cleanedBatterName);
      batterRuns.push(runsDisplay);
      batterBalls.push(balls || '—');
      batterRowsHtml += `<div class="ss-player-row" style="--delay:${i*0.05}s">
        <span class="ss-player-name">${cleanedBatterName}</span>
        <span class="ss-player-stat">${runsDisplay}</span>
        <span class="ss-player-stat muted">${balls ? '('+balls+')' : ''}</span>
      </div>`;
    }

    // Build bowler rows — format: W-R (Ov)
    let bowlerNames = [], bowlerStats = [];
    let bowlerRowsHtml = '';
    for (let i = 1; i <= n; i++) {
      const name = d[p+'bowler'+i+'_name'];
      const wkts = d[p+'bowler'+i+'_wickets'];
      const runs = d[p+'bowler'+i+'_runs'];
      const ovs  = d[p+'bowler'+i+'_overs'];
      if (!name) continue;
      const cleanedBowlerName = cleanName(name);
      const displayStat = `${wkts||'0'}-${runs||'0'}${ovs ? ' ('+ovs+')' : ''}`;
      const copyStat = `${wkts||'0'}-${runs||'0'}`; // no overs in clipboard
      bowlerNames.push(cleanedBowlerName);
      bowlerStats.push(copyStat);
      bowlerRowsHtml += `<div class="ss-player-row" style="--delay:${(i+4)*0.05}s">
        <span class="ss-player-name">${cleanedBowlerName}</span>
        <span class="ss-player-stat wickets">${displayStat}</span>
      </div>`;
    }

    // Unique IDs for copy targets (per-team batter/bowler only)
    const bnId   = prefix+'-batter-names';
    const brId   = prefix+'-batter-runs';
    const bbId   = prefix+'-batter-balls';
    const bowlId = prefix+'-bowler-names';
    const bsId   = prefix+'-bowler-stats';

    const teamNameClean = d[prefix+'_name'] || label;

    return `
      <div class="ss-team-row ${prefix==='team1'?'batting-first':''}">
        <span class="ss-team-name">${teamNameClean}</span>
        <span class="ss-overs">${d[prefix+'_overs'] ? d[prefix+'_overs']+' ov' : ''}</span>
        <span class="ss-score">${d[prefix+'_score'] || '—'}</span>
      </div>
      <div class="ss-players">
        <div class="ss-section-label">${ic('bat')} Top Batters
          <div class="ss-copy-group">
            ${copyBtn(bnId)} Names
            ${copyBtn(brId)} Runs
            ${copyBtn(bbId)} Balls
          </div>
        </div>
        <span id="${bnId}" style="display:none">${batterNames.join('\n')}</span>
        <span id="${brId}" style="display:none">${batterRuns.join('\n')}</span>
        <span id="${bbId}" style="display:none">${batterBalls.join('\n')}</span>
        ${batterRowsHtml || '<div style="color:var(--muted);font-size:13px;padding:4px 0">No data</div>'}

        <div class="ss-section-label" style="margin-top:14px">${ic('zap')} Top Bowlers
          <div class="ss-copy-group">
            ${copyBtn(bowlId)} Names
            ${copyBtn(bsId)} Figures
          </div>
        </div>
        <span id="${bowlId}" style="display:none">${bowlerNames.join('\n')}</span>
        <span id="${bsId}" style="display:none">${bowlerStats.join('\n')}</span>
        ${bowlerRowsHtml || '<div style="color:var(--muted);font-size:13px;padding:4px 0">No data</div>'}
      </div>`;
  };

  // Build both-team combined copy values
  const t1Name = d['team1_name'] || 'Team 1';
  const t2Name = d['team2_name'] || 'Team 2';
  const t1Score = (d['team1_score'] || '').replace('/', '-');
  const t2Score = (d['team2_score'] || '').replace('/', '-');
  const t1Overs = d['team1_overs'] || '';
  const t2Overs = d['team2_overs'] || '';

  el.innerHTML = `
    <span id="both-team-names" style="display:none">${t1Name}
${t2Name}</span>
    <span id="both-team-scores" style="display:none">${t1Score}
${t2Score}</span>
    <span id="both-team-overs" style="display:none">${t1Overs}
${t2Overs}</span>
    <div class="ss-header">
      <div class="ss-tournament">${d.match_title || 'Match Summary'}</div>
      ${metaItems ? `<div class="ss-meta">${metaItems}</div>` : ''}
    </div>
    <div class="ss-innings">
      ${teamBlock('team1', 'Team 1')}
      <div class="ss-divider"></div>
      ${teamBlock('team2', 'Team 2')}
    </div>
    <div class="ss-both-copy-row">
      ${copyBtn('both-team-names')} Both Team Names
      ${copyBtn('both-team-scores')} Both Scores
      ${copyBtn('both-team-overs')} Both Overs
    </div>
    ${d.match_result ? `
    <div class="ss-result">
      <div class="ss-result-text">${ic('trophy')} ${d.match_result}</div>
      ${d.man_of_match ? `<div class="ss-mom">${ic('award')} Player of Match: <strong>${d.man_of_match}</strong></div>` : ''}
    </div>` : ''}
  `;

  // Wire up copy buttons
  el.querySelectorAll('.ss-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.copyTarget;
      const textEl = document.getElementById(targetId);
      if (!textEl) return;
      navigator.clipboard.writeText(textEl.textContent).then(() => {
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1800);
      });
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Helper to get lucide SVG path string for inline use
function lucideIcon(name) {
  const icons = {
    'calendar': '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
    'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    'coins': '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    'bat': '<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8-1 1"/>',
    'zap': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    'trophy': '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    'award': '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  };
  return icons[name] || '';
}

// =================== LOADER STEP PROGRESSION ===================

function advanceLoaderStep(step) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('lstep'+i);
    if (!el) continue;
    if (i < step) { el.classList.remove('active'); el.classList.add('done'); }
    else if (i === step) { el.classList.add('active'); el.classList.remove('done'); }
    else { el.classList.remove('active', 'done'); }
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}