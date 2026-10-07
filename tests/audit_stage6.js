const fs = require('fs');

console.log('=== SEARCHING FOR COPY ISSUES ===');
const files = ['index.html', 'js/script.js', 'js/progress.js'];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes('simulation mission')) {
      console.log(`[SIMULATION MISSION] ${file}:${idx + 1} -> ${line.trim()}`);
    }
    if (line.includes('trainee') || line.includes('Trainee') || line.includes('TRAINEE')) {
      // Check if it's visible text or code ID
      if (!line.includes('titleId: "trainee"') && !line.includes('trainee-card') && !line.includes('renderTraineeAvatarSVG') && !line.includes('id === "trainee"')) {
        console.log(`[TRAINEE] ${file}:${idx + 1} -> ${line.trim()}`);
      }
    }
  });
});

console.log('\n=== SEARCHING FOR DEBUG LOGS IN JS ===');
const jsFiles = ['js/script.js', 'js/progress.js'];
jsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('console.log(')) {
      console.log(`[CONSOLE LOG] ${file}:${idx + 1} -> ${line.trim()}`);
    }
  });
});
