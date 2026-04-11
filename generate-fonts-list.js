#!/usr/bin/env node
// Run this after adding fonts to the /fonts folder:
//   node generate-fonts-list.js
//
// This creates fonts/fonts.json which the app reads at startup.

const fs = require('fs');
const path = require('path');

const fontsDir = path.join(__dirname, 'fonts');
const outputFile = path.join(fontsDir, 'fonts.json');

const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'];

const fontFiles = fs.readdirSync(fontsDir)
  .filter(f => FONT_EXTENSIONS.includes(path.extname(f).toLowerCase()))
  .map(filename => {
    const ext = path.extname(filename).toLowerCase();
    const baseName = path.basename(filename, ext);
    // Convert filename to display name: "MyFont-Bold" -> "MyFont Bold"
    const displayName = baseName.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    return {
      name: displayName,
      file: filename,
      url: `../fonts/${filename}`
    };
  });

fs.writeFileSync(outputFile, JSON.stringify(fontFiles, null, 2));
console.log(`✅ fonts.json generated with ${fontFiles.length} font(s):`);
fontFiles.forEach(f => console.log(`   - ${f.name} (${f.file})`));

if (fontFiles.length === 0) {
  console.log('   (no fonts found — add .ttf/.otf files to the fonts/ folder)');
}