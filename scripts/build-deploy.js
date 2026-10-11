/**
 * ReadyVerse - Working prototype Build & Deploy Package Generator
 * Plain Node.js script (zero external libraries) that creates deploy/ containing ONLY
 * the files needed for working prototype static hosting.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const deployDir = path.join(rootDir, 'deploy');

console.log('=======================================================');
console.log('📦 BUILDING READYVERSE DEPLOY PACKAGE (deploy/)');
console.log('=======================================================\n');

// 1. Clean and Recreate deploy/ directory
if (fs.existsSync(deployDir)) {
    console.log('  → Removing existing deploy/ directory...');
    fs.rmSync(deployDir, { recursive: true, force: true });
}
fs.mkdirSync(deployDir, { recursive: true });
console.log('  → Created fresh deploy/ directory.');

// Helper to copy file
function copyFile(relPath) {
    const src = path.join(rootDir, relPath);
    const dest = path.join(deployDir, relPath);
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
}

// Helper to copy directory recursively
function copyDir(relDir) {
    const srcDir = path.join(rootDir, relDir);
    if (!fs.existsSync(srcDir)) return;
    
    function walk(curDir) {
        fs.readdirSync(curDir).forEach(item => {
            const itemPath = path.join(curDir, item);
            const rel = path.relative(rootDir, itemPath);
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory()) {
                walk(itemPath);
            } else if (stat.isFile()) {
                copyFile(rel);
            }
        });
    }
    walk(srcDir);
}

// 2. Copy deploy assets
console.log('  → Copying app files and folders...');

// Top-level files
const topLevelFiles = [
    'index.html',
    'review.html',
    'robots.txt',
    'manifest.json',
    'sw.js'
];

topLevelFiles.forEach(f => {
    if (fs.existsSync(path.join(rootDir, f))) {
        copyFile(f);
    }
});

// App folders
const appFolders = [
    'css',
    'js',
    'assets',
    'icons'
];

appFolders.forEach(folder => {
    copyDir(folder);
});

// Update CACHE_NAME based on assets content hash
const { syncCacheVersion } = require('./update-cache-version');
const cacheSync = syncCacheVersion();
console.log(`\n  ✓ Synced Service Worker CACHE_NAME to: ${cacheSync.rootResult?.newVersion || 'readyverse-' + cacheSync.hash}`);

// 3. Count total files in deploy/
let totalFiles = 0;
function countFiles(dir) {
    fs.readdirSync(dir).forEach(item => {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
            countFiles(itemPath);
        } else if (stat.isFile()) {
            totalFiles++;
        }
    });
}
countFiles(deployDir);
console.log(`\n  ✓ Total files successfully copied into deploy/: ${totalFiles}`);

// 4. Verify that EVERY referenced asset exists inside deploy/
console.log('\n--- VERIFYING REFERENCED FILES INSIDE deploy/ ---');

function auditDeployReferences() {
    let auditErrors = 0;
    let checkedCount = 0;

    function checkRef(type, rawPath, source) {
        checkedCount++;
        // Ignore external or anchor/data urls
        if (rawPath.startsWith('http://') || rawPath.startsWith('https://') || rawPath.startsWith('data:') || rawPath.startsWith('#') || rawPath === './' || rawPath === '/') {
            return;
        }

        const clean = rawPath.startsWith('./') ? rawPath.slice(2) : (rawPath.startsWith('/') ? rawPath.slice(1) : rawPath);
        const target = path.join(deployDir, clean);
        const exists = fs.existsSync(target);

        if (!exists) {
            console.error(`  ✖ ERROR: Missing asset referenced in ${source} [${type}]: "${rawPath}" (Resolved: ${target})`);
            auditErrors++;
        }
    }

    // 1. Audit deploy/index.html
    const indexContent = fs.readFileSync(path.join(deployDir, 'index.html'), 'utf8');
    
    // Scripts
    const sRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = sRegex.exec(indexContent)) !== null) checkRef('<script src>', m[1], 'deploy/index.html');

    // Links (CSS/manifest/icons)
    const lRegex = /<link\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
    while ((m = lRegex.exec(indexContent)) !== null) checkRef('<link href>', m[1], 'deploy/index.html');

    // Images
    const iRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
    while ((m = iRegex.exec(indexContent)) !== null) checkRef('<img src>', m[1], 'deploy/index.html');

    // Video sources
    const vRegex = /<source\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
    while ((m = vRegex.exec(indexContent)) !== null) checkRef('<source src>', m[1], 'deploy/index.html');

    // 2. Audit deploy/manifest.json
    const manifestJson = JSON.parse(fs.readFileSync(path.join(deployDir, 'manifest.json'), 'utf8'));
    if (manifestJson.icons) {
        manifestJson.icons.forEach(ic => checkRef('manifest.icons', ic.src, 'deploy/manifest.json'));
    }
    if (manifestJson.shortcuts) {
        manifestJson.shortcuts.forEach(sc => {
            if (sc.icons) sc.icons.forEach(ic => checkRef('manifest.shortcuts', ic.src, 'deploy/manifest.json'));
        });
    }

    // 3. Audit deploy/sw.js
    const swTxt = fs.readFileSync(path.join(deployDir, 'sw.js'), 'utf8');
    const swArr = swTxt.match(/STATIC_ASSETS\s*=\s*\[([\s\S]*?)\];/);
    if (swArr) {
        const rawItems = swArr[1].match(/['"]([^'"]+)['"]/g) || [];
        rawItems.forEach(it => checkRef('sw.precache', it.replace(/['"]/g, ''), 'deploy/sw.js'));
    }

    // 4. Audit JS assets in deploy/js/script.js
    const scriptJsTxt = fs.readFileSync(path.join(deployDir, 'js/script.js'), 'utf8');
    const jsAssets = scriptJsTxt.match(/assets\/[a-zA-Z0-9_\-\.\/]+/g) || [];
    jsAssets.forEach(a => checkRef('script.js asset', a, 'deploy/js/script.js'));

    console.log(`  ✓ Checked ${checkedCount} references across deploy bundle.`);
    if (auditErrors === 0) {
        console.log('  ✓ 100% of referenced files exist inside deploy/ with zero missing assets!');
    } else {
        console.error(`  ✖ FAILED: ${auditErrors} referenced assets are missing inside deploy/!`);
        process.exit(1);
    }
}

auditDeployReferences();

// 5. Audit for secret leakage in deploy/
console.log('\n--- AUDITING deploy/ FOR SECRETS & KEYS ---');
const secretPatterns = [
    /AIzaSy[0-9A-Za-z_-]{33}/,
    /gsk_[0-9A-Za-z]{32,}/,
    /sk-[0-9A-Za-z]{32,}/,
    /-----BEGIN PRIVATE KEY-----/
];

let secretLeaks = 0;
function scanDirForSecrets(dir) {
    fs.readdirSync(dir).forEach(item => {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
            scanDirForSecrets(itemPath);
        } else if (stat.isFile()) {
            const ext = path.extname(itemPath).toLowerCase();
            if (['.html', '.js', '.css', '.json', '.txt'].includes(ext)) {
                const txt = fs.readFileSync(itemPath, 'utf8');
                secretPatterns.forEach(pat => {
                    if (pat.test(txt)) {
                        console.error(`  ✖ SECURITY LEAK: Secret pattern found in ${path.relative(rootDir, itemPath)}`);
                        secretLeaks++;
                    }
                });
            }
        }
    });
}
scanDirForSecrets(deployDir);

if (secretLeaks === 0) {
    console.log('  ✓ Security Audit Passed: ZERO secrets, tokens, or API keys found in deploy/ bundle.');
} else {
    console.error(`  ✖ Security Audit FAILED: ${secretLeaks} secrets found in deploy/!`);
    process.exit(1);
}

console.log('\n=======================================================');
console.log('🎉 deploy/ BUILD COMPLETED SUCCESSFULLY!');
console.log('=======================================================\n');
