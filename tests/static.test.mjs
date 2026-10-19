import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('production build emits canonical sitemap and verification without private files',async()=>{
 execFileSync(process.execPath,['scripts/build.mjs'],{env:{...process.env,SITE_URL:'https://xd-bridge-test.example',GOOGLE_SITE_VERIFICATION:'test-verification'}});
 const html=await fs.readFile('dist/index.html','utf8');
 assert.match(html,/<html lang="ko">/);assert.match(html,/rel="canonical" href="https:\/\/xd-bridge-test.example\//);assert.match(html,/google-site-verification/);
 const sitemap=await fs.readFile('dist/sitemap.xml','utf8');assert.match(sitemap,/https:\/\/xd-bridge-test.example\//);
 const robots=await fs.readFile('dist/robots.txt','utf8');assert.match(robots,/Allow: \//);assert.match(robots,/Sitemap:/);
 async function scan(dir){for(const file of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,file.name);if(file.isDirectory())await scan(p);else{assert.doesNotMatch(p,/\.xd$|\.figcraft$|browser-results|qa-browser/i);}}}
 await scan('dist');
});

test('conversion scripts contain no remote conversion or analytics endpoint',async()=>{
 const worker=await fs.readFile('src/worker.js','utf8');const app=await fs.readFile('src/app.js','utf8');
 assert.doesNotMatch((worker+app).replaceAll('http://www.w3.org/2000/svg',''),/https?:\/\//);assert.doesNotMatch(worker+app,/sendBeacon|FormData|XMLHttpRequest|gtag|analytics/i);
 assert.match(worker,/indexURL:'\/runtime\//);assert.match(app,/new Worker\('\/worker.js'\)/);
});

test('untrusted SVG is displayed as image, never injected as HTML',async()=>{
 const app=await fs.readFile('src/app.js','utf8');assert.doesNotMatch(app,/innerHTML\s*=|srcdoc\s*=/);assert.match(app,/\.decode\(\)/);assert.match(app,/worker\.terminate\(\)/);
});
