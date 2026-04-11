# 🏏 CricSnap — Cricket Summary Generator

Generate professional cricket match summary graphics from scorecard screenshots using AI.

---

## ⚡ Quick Setup

### 1. Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a project (or use existing)
3. Enable **Authentication** → Email/Password + Google
4. Enable **Firestore Database** → Start in Test Mode
5. Copy your Firebase config

**Open `js/firebase-config.js` and replace the config:**
```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 2. Anthropic API Key
Open `js/generate.js` and replace:
```js
const ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY';
```
> ⚠️ **For production**: Move API calls to a backend (Vercel Edge Function) to hide the key.

### 3. Cloudinary
Already configured with your credentials:
- Cloud Name: `duw28chtl`
- Upload Preset: `match-summary`

Make sure the upload preset is set to **Unsigned** in Cloudinary dashboard.

---

## 🚀 Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# From the cricsnap folder:
vercel

# Follow prompts — select the cricsnap folder as root
```

Or drag & drop the folder to [vercel.com/new](https://vercel.com/new).

---

## 📁 Project Structure

```
cricsnap/
├── index.html              # Login / Signup
├── pages/
│   ├── dashboard.html      # User dashboard
│   ├── templates.html      # Template manager
│   └── generate.html       # Summary generator
├── css/
│   ├── auth.css
│   ├── dashboard.css       # Shared styles + navbar
│   ├── dashboard-page.css  # Dashboard page styles
│   ├── templates.css       # Template editor styles
│   └── generate.css        # Generator page styles
├── js/
│   ├── firebase-config.js  # ← PUT YOUR FIREBASE CONFIG HERE
│   ├── auth.js             # Login / signup logic
│   ├── auth-guard.js       # Route protection
│   ├── dashboard.js        # Dashboard data
│   ├── templates.js        # Template CRUD + field editor
│   ├── generate.js         # AI analysis + canvas rendering
│   └── cloudinary.js       # Image upload utility
└── vercel.json             # Vercel config
```

---

## 🎯 How to Use

### Creating Templates
1. Go to **Templates** → **New Template**
2. Upload your background image (PNG/JPG)
3. Click **+ Add Field** to create a data field box
4. Drag and resize each box to position it on the background
5. Select the **Field Type** (e.g. "Team 1 Name", "Batter #1 Runs", etc.)
6. Set font size, color, weight, alignment
7. Click **Save Template**

### Generating Summaries
1. Go to **Generate**
2. Upload a full-page screenshot of a CricHeroes scorecard
3. Click **Analyze with AI** — Claude will extract all match data
4. Review and edit the extracted data
5. Choose a template (or use plain card)
6. Click **Generate Final Card**
7. Preview and download the PNG

---

## 🔒 Firestore Rules (Recommended)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /templates/{doc} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null;
    }
    match /summaries/{doc} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null;
    }
  }
}
```

---

## 🛠️ Production Security

For production deployment, create a Vercel Edge Function to proxy Anthropic API calls:

```
/api/analyze.js  ← stores API key as environment variable
```

This prevents exposing your API key in client-side JS.
