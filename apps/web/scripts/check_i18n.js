const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function (file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

function extractKeysFromFile(filePath) {
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    const re = /t\(\s*['\"]dashboard\.([A-Za-z0-9_.-]+)['\"]\s*\)/g;
    const keys = new Set();
    let m;
    while ((m = re.exec(txt)) !== null) {
      keys.add(m[1]);
    }
    return Array.from(keys);
  } catch (e) {
    return [];
  }
}

function main() {
  const src = path.join(__dirname, '..', 'src');
  const allFiles = walk(src).filter(f => /\.(ts|tsx|js|jsx)$/.test(f));
  const usedKeysSet = new Set();
  allFiles.forEach(f => {
    const k = extractKeysFromFile(f);
    k.forEach(x => usedKeysSet.add(x));
  });
  const usedKeys = Array.from(usedKeysSet).sort();
  const enPath = path.join(__dirname, '..', 'src', 'lib', 'i18n', 'locales', 'en.json');
  const esPath = path.join(__dirname, '..', 'src', 'lib', 'i18n', 'locales', 'es.json');
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8')).dashboard || {};
  const es = JSON.parse(fs.readFileSync(esPath, 'utf8')).dashboard || {};
  const enKeys = new Set(Object.keys(en));
  const esKeys = new Set(Object.keys(es));
  const missingEn = usedKeys.filter(k => !enKeys.has(k));
  const missingEs = usedKeys.filter(k => !esKeys.has(k));
  console.log('USED_KEYS_COUNT:', usedKeys.length);
  console.log(usedKeys.join('\n'));
  console.log('\nMISSING_IN_EN_COUNT:', missingEn.length);
  console.log(missingEn.join('\n') || '<none>');
  console.log('\nMISSING_IN_ES_COUNT:', missingEs.length);
  console.log(missingEs.join('\n') || '<none>');
}

main();
