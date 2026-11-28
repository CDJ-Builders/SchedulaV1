const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlFiles = [
  path.join(root, 'index.html'),
  ...walk(path.join(root, 'pages')).filter(file => file.endsWith('.html')),
  path.join(root, 'admin', 'index.html')
];
const missing = [];

for (const htmlFile of htmlFiles) {
  const source = fs.readFileSync(htmlFile, 'utf8');
  const attributes = /<(?:script\b[^>]*?\bsrc|link\b[^>]*?\bhref)\s*=\s*(["'])(.*?)\1/gi;
  for (const match of source.matchAll(attributes)) {
    const asset = match[2].split(/[?#]/, 1)[0];
    if (!asset || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(asset)) continue;
    const candidate = path.resolve(path.dirname(htmlFile), decodeURIComponent(asset));
    if (!fs.existsSync(candidate)) missing.push(`${path.relative(root, htmlFile)}: ${asset}`);
  }
}

if (missing.length) {
  console.error(`Missing local HTML assets:\n${missing.map(item => `- ${item}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${htmlFiles.length} HTML files; all local script and link assets exist.`);
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}
