import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.resolve('dist');
if(dist!==path.join(projectRoot,'dist'))throw Error('Run the build from the project directory.');
await fs.rm(dist,{recursive:true,force:true});await fs.mkdir(dist,{recursive:true});
await fs.cp('src',dist,{recursive:true,filter:source=>!source.split(path.sep).includes('__pycache__')&&!source.endsWith('.pyc')});
await fs.mkdir(path.join(dist,'runtime'),{recursive:true});
for(const file of ['pyodide.js','pyodide.asm.js','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json']){
 await fs.copyFile(path.join('node_modules/pyodide',file),path.join(dist,'runtime',file));
}
for(const file of ['LICENSE','README.md']){
 try{await fs.copyFile(path.join('node_modules/pyodide',file),path.join(dist,'runtime',file));}catch{}
}
await fs.copyFile('PYODIDE-LICENSE.txt',path.join(dist,'runtime','LICENSE'));
const rawOrigin=process.env.SITE_URL||(process.env.VERCEL_PROJECT_PRODUCTION_URL?'https://'+process.env.VERCEL_PROJECT_PRODUCTION_URL:'');
const origin=rawOrigin?new URL(rawOrigin).origin:'';
const index=await fs.readFile(path.join(dist,'index.html'),'utf8');
const esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const metadata=(origin?`<link rel="canonical" href="${esc(origin)}/"><meta property="og:url" content="${esc(origin)}/">`:'')+(process.env.GOOGLE_SITE_VERIFICATION?`<meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}">`:'');
await fs.writeFile(path.join(dist,'index.html'),index.replace('<!-- DEPLOY_METADATA -->',metadata));
await fs.writeFile(path.join(dist,'robots.txt'),'User-agent: *\nAllow: /\n'+(origin?'Sitemap: '+origin+'/sitemap.xml\n':''));
await fs.writeFile(path.join(dist,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+(origin?'<url><loc>'+esc(origin)+'/</loc></url>':'')+'</urlset>');
console.log('Built static browser converter. '+(origin?'SEO origin: '+origin:'Production origin will be set on Vercel.'));
