/**
 * ReadyVerse - Cache Version Auto-Updater
 * Calculates a deterministic SHA-256 hash across all pre-cached static assets
 * and updates CACHE_NAME in sw.js (and deploy/sw.js if it exists).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');

function computeAssetsHash(dir = rootDir) {
    const swPath = path.join(rootDir, 'sw.js');
    const swContent = fs.readFileSync(swPath, 'utf8');
    const match = swContent.match(/STATIC_ASSETS\s*=\s*\[([\s\S]*?)\];/);
    if (!match) throw new Error('STATIC_ASSETS array not found in sw.js');

    const assets = (match[1].match(/['"]([^'"]+)['"]/g) || []).map(s => s.replace(/['"]/g, ''));
    const hash = crypto.createHash('sha256');

    for (const rel of assets) {
        if (rel === './') {
            const indexP = path.join(dir, 'index.html');
            if (fs.existsSync(indexP)) {
                hash.update('index.html:' + fs.readFileSync(indexP));
            }
            continue;
        }
        const cleanPath = rel.startsWith('./') ? rel.slice(2) : rel;
        const filePath = path.join(dir, cleanPath);
        if (fs.existsSync(filePath)) {
            const buf = fs.readFileSync(filePath);
            hash.update(cleanPath + ':');
            hash.update(buf);
        }
    }
    return hash.digest('hex').slice(0, 10);
}

function updateSwCacheName(swPath, newVersion) {
    if (!fs.existsSync(swPath)) return null;
    let content = fs.readFileSync(swPath, 'utf8');
    const oldVersionMatch = content.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"];/);
    const oldVersion = oldVersionMatch ? oldVersionMatch[1] : null;

    content = content.replace(
        /const\s+CACHE_NAME\s*=\s*['"][^'"]+['"];/,
        `const CACHE_NAME = 'readyverse-${newVersion}';`
    );
    fs.writeFileSync(swPath, content, 'utf8');
    return { oldVersion, newVersion: `readyverse-${newVersion}` };
}

function syncCacheVersion() {
    const hash = computeAssetsHash(rootDir);
    const rootResult = updateSwCacheName(path.join(rootDir, 'sw.js'), hash);
    const deploySw = path.join(rootDir, 'deploy', 'sw.js');
    let deployResult = null;
    if (fs.existsSync(deploySw)) {
        deployResult = updateSwCacheName(deploySw, hash);
    }
    return { hash, rootResult, deployResult };
}

if (require.main === module) {
    const res = syncCacheVersion();
    console.log(`[Cache Version Sync]`);
    console.log(`  Assets Hash:  ${res.hash}`);
    if (res.rootResult) {
        console.log(`  Root sw.js:   ${res.rootResult.oldVersion} -> ${res.rootResult.newVersion}`);
    }
    if (res.deployResult) {
        console.log(`  Deploy sw.js: ${res.deployResult.oldVersion} -> ${res.deployResult.newVersion}`);
    }
}

module.exports = {
    computeAssetsHash,
    updateSwCacheName,
    syncCacheVersion
};
