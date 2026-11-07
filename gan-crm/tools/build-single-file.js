#!/usr/bin/env node
'use strict';
// Builds one self-contained HTML file from index.html: inlines styles.css and
// every <script src> in the same order. Used for the single-file version
// (for example a page opened on the iPhone from a link).
// Usage: node tools/build-single-file.js [output.html]   (default: dist/gan-crm.html)
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist', 'gan-crm.html'));
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const read = rel => {
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) throw new Error('path outside the app: ' + rel);
  return fs.readFileSync(file, 'utf8');
};

html = html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/?>/g, (_, href) => `<style>\n${read(href)}</style>`);
let count = 0;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = read(src);
  if (/<\/script/i.test(code)) throw new Error(`${src} contains "</script", cannot inline safely`);
  count++;
  return `<script>/* ${src} */\n${code}</script>`;
});
if (count === 0) throw new Error('no scripts found in index.html');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`built ${path.relative(process.cwd(), out)} (${count} scripts, ${Math.round(html.length / 1024)} KB)`);
