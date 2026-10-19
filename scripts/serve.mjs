import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const config=JSON.parse(await fs.readFile('vercel.json','utf8'));
const securityHeaders=Object.fromEntries(config.headers[0].headers.map(h=>[h.key,h.value]));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.py':'text/plain','.txt':'text/plain','.zip':'application/zip'};
const server=http.createServer(async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 const bytes=await fs.readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream',...securityHeaders});res.end(bytes);
}catch{res.writeHead(404);res.end('Not found');}});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
