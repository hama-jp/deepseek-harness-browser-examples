import { build } from 'esbuild';
import fs from 'node:fs';

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100'],
  outfile: 'dist/bundle.js',
  legalComments: 'none',
});

const bundle = fs.readFileSync('dist/bundle.js', 'utf8');
const template = fs.readFileSync('src/template.html', 'utf8');
const html = template.replace('/*__BUNDLE__*/', () => bundle);
fs.writeFileSync('index.html', html);
console.log(`Built index.html (${(html.length / 1024).toFixed(0)} KB)`);
