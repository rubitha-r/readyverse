const fs = require('fs');

console.log('=== A1: COMPLETE DUPLICATE IDS AUDIT IN index.html ===');
const html = fs.readFileSync('index.html', 'utf8');
const idRegex = /\bid=["']([^"'\s>]+)["']/gi;
const idCounts = {};
let m;
while ((m = idRegex.exec(html)) !== null) {
  const id = m[1];
  idCounts[id] = (idCounts[id] || 0) + 1;
}

const dups = Object.entries(idCounts).filter(e => e[1] > 1);
console.log('Total IDs found in index.html:', Object.keys(idCounts).length);
console.log('Duplicate IDs count:', dups.length);
dups.forEach(([id, count]) => {
  console.log(`  - #${id}: appears ${count} times`);
});

console.log('\n=== A1: JS $(...) / getElementById / querySelector AUDIT ===');
const jsFiles = [
  'js/script.js',
  'js/progress.js',
  'js/readyverse-ai/chat.js',
  'js/readyverse-ai/config.js',
  'js/readyverse-ai/gemini.js',
  'js/readyverse-ai/groq.js',
  'js/readyverse-ai/knowledge.js',
  'js/readyverse-ai/safety.js'
];

const jsIds = new Map(); // id -> array of file:line
jsFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, idx) => {
    // $('id') or $("id")
    const dollarCall = /(?:^|[^\w$])\$\(\s*['"]([a-zA-Z0-9_\-]+)['"]\s*\)/g;
    let match;
    while ((match = dollarCall.exec(line)) !== null) {
      const id = match[1];
      if (!jsIds.has(id)) jsIds.set(id, []);
      jsIds.get(id).push(`${file}:${idx + 1}`);
    }

    // getElementById('id')
    const getEl = /(?:document|\w+)\.getElementById\(\s*['"]([a-zA-Z0-9_\-]+)['"]\s*\)/g;
    while ((match = getEl.exec(line)) !== null) {
      const id = match[1];
      if (!jsIds.has(id)) jsIds.set(id, []);
      jsIds.get(id).push(`${file}:${idx + 1}`);
    }
    
    // querySelector('#id')
    const qs = /(?:document|\w+)\.querySelector(?:All)?\(\s*['"]#([a-zA-Z0-9_\-]+)(?:[^\w\-]|$)/g;
    while ((match = qs.exec(line)) !== null) {
      const id = match[1];
      if (!jsIds.has(id)) jsIds.set(id, []);
      jsIds.get(id).push(`${file}:${idx + 1}`);
    }
  });
});

console.log('Total static unique IDs queried by JS:', jsIds.size);
const missingFromHtml = [];
const dynamicOrKnownCreatedInJs = [
  'simCanvas', 'simTouchActionBtn', 'simZonePill', 'simLocationText', 'simObjectiveText', 'simFeedbackToast'
];

for (const [id, locations] of jsIds.entries()) {
  if (!idCounts[id]) {
    missingFromHtml.push({ id, locations, isDynamic: dynamicOrKnownCreatedInJs.includes(id) });
  }
}

console.log('IDs queried in JS but missing in index.html:', missingFromHtml.length);
missingFromHtml.forEach(({ id, locations, isDynamic }) => {
  console.log(`  - Missing #${id} [${isDynamic ? 'CREATED DYNAMICALLY IN JS' : 'NOT FOUND IN HTML'}] (queried at ${locations.slice(0, 3).join(', ')}${locations.length > 3 ? '...' : ''})`);
});
