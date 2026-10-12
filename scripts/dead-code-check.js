const fs = require('fs');
const path = require('path');

function getScriptTags(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const regex = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi;
    const scripts = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        scripts.push(match[1]);
    }
    return scripts;
}

const indexScripts = getScriptTags('index.html');
const deployScripts = getScriptTags('deploy/index.html');

console.log('=======================================================');
console.log('📜 SCRIPT TAGS IN index.html (' + indexScripts.length + ' scripts)');
console.log('=======================================================');
indexScripts.forEach((s, i) => console.log(`${i + 1}. ${s}`));

console.log('\n=======================================================');
console.log('📜 SCRIPT TAGS IN deploy/index.html (' + deployScripts.length + ' scripts)');
console.log('=======================================================');
deployScripts.forEach((s, i) => console.log(`${i + 1}. ${s}`));

// Check files in js/readyverse-ai/
function getAllFiles(dir, baseDir = dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllFiles(fullPath, baseDir));
        } else {
            const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
            results.push(relPath);
        }
    });
    return results;
}

const aiFiles = getAllFiles('js/readyverse-ai');

console.log('\n=======================================================');
console.log('🔎 FILES IN js/readyverse-ai/ (' + aiFiles.length + ' files)');
console.log('=======================================================');
aiFiles.forEach(f => {
    const loadedInIndex = indexScripts.some(s => s.endsWith(f));
    const loadedInDeploy = deployScripts.some(s => s.endsWith(f));
    console.log(`- js/readyverse-ai/${f}:`);
    console.log(`    Loaded by index.html:        ${loadedInIndex ? '✅ YES' : '❌ NO'}`);
    console.log(`    Loaded by deploy/index.html: ${loadedInDeploy ? '✅ YES' : '❌ NO'}`);
});

// Check Service Worker precache list in sw.js
const swContent = fs.readFileSync('sw.js', 'utf8');
const precacheMatch = swContent.match(/STATIC_ASSETS\s*=\s*\[([\s\S]*?)\];/);
let precacheAssets = [];
if (precacheMatch) {
    precacheAssets = precacheMatch[1]
        .split('\n')
        .map(l => l.trim().replace(/^['"]|['"],?$/g, ''))
        .filter(l => l && !l.startsWith('//'));
}

console.log('\n=======================================================');
console.log('📦 SERVICE WORKER PRECACHE ASSETS (' + precacheAssets.length + ' assets in sw.js)');
console.log('=======================================================');
precacheAssets.forEach(a => console.log(`  - ${a}`));

console.log('\n=======================================================');
console.log('🔎 AUDIT: READYVERSE-AI FILES IN SW STATIC_ASSETS');
console.log('=======================================================');
aiFiles.forEach(f => {
    const webPath = './js/readyverse-ai/' + f;
    const inPrecache = precacheAssets.some(a => a === webPath || a === webPath.replace('./', ''));
    if (!inPrecache) {
        console.log(`  ❌ Missing from sw.js static assets: ${webPath}`);
    } else {
        console.log(`  ✅ Included in sw.js static assets: ${webPath}`);
    }
});
