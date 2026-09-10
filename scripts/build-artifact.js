// Inlines public/index.html + public/style.css + public/js/*.js into a
// single self-contained HTML file, for publishing as a Claude Artifact
// (which has no server, so it can't load style.css/js/*.js as separate
// requests -- everything has to live in the one file it's given).
//
// Run: node scripts/build-artifact.js
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'pixel-warren.artifact.html');

const JS_MODULES = ['sprites', 'content', 'state', 'render', 'combat', 'ui'];
const SCRIPT_TAGS = JS_MODULES.map((n) => `<script src="js/${n}.js"></script>`).join('\n');

let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC_DIR, 'style.css'), 'utf8');

const js = JS_MODULES
  .map((n) => fs.readFileSync(path.join(PUBLIC_DIR, 'js', n + '.js'), 'utf8').replace(/^"use strict";\n+/, ''))
  .join('\n');
const wrappedJs = '(function(){\n"use strict";\n\n' + js.trimEnd() + '\n})();\n';

if (!html.includes('<link rel="stylesheet" href="style.css">')) {
  throw new Error('style.css <link> tag not found in public/index.html -- did the markup change?');
}
if (!html.includes(SCRIPT_TAGS)) {
  throw new Error('expected sequence of <script src="js/*.js"> tags not found in public/index.html -- did the markup change?');
}

html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '</style>');
html = html.replace(SCRIPT_TAGS, '<script>\n' + wrappedJs + '</script>');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, html);
console.log('Built ' + OUT_FILE + ' (' + (html.length / 1024).toFixed(1) + ' KB)');
