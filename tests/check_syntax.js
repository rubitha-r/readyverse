const fs = require('fs');
const path = require('path');
const vm = require('vm');

const targetDirs = ['js', 'tests'];
const rootFiles = ['server.js'];

let files = [];
rootFiles.forEach(f => {
  if (fs.existsSync(f)) files.push(f);
});

targetDirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  const list = fs.readdirSync(dir, { recursive: true });
  list.forEach(f => {
    const full = path.join(dir, f);
    if (full.endsWith('.js') && fs.statSync(full).isFile()) {
      files.push(full);
    }
  });
});

console.log(`Checking ${files.length} JS files with syntax parse (vm.Script)...`);
let failed = 0;

files.forEach(f => {
  try {
    const code = fs.readFileSync(f, 'utf8');
    new vm.Script(code, { filename: f });
    console.log(`  ✓ ${f.replace(/\\/g, '/')}`);
  } catch (err) {
    console.error(`  ✖ ${f.replace(/\\/g, '/')}: ${err.message}`);
    failed++;
  }
});

console.log(`\nResult: ${failed === 0 ? 'ALL PASSED' : failed + ' FAILED'}`);
process.exit(failed > 0 ? 1 : 0);
