import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
await rm(new URL('../dist/',import.meta.url),{recursive:true,force:true});
await mkdir(new URL('../dist/server/',import.meta.url),{recursive:true});
const assets = {};
for (const [route,file,type] of [['/','index.html','text/html; charset=utf-8'],['/style.css','style.css','text/css; charset=utf-8'],['/app.js','app.js','text/javascript; charset=utf-8'],['/icon.svg','icon.svg','image/svg+xml']]) {
  assets[route] = [await readFile(new URL('../public/'+file,import.meta.url),'utf8'),type];
}
const api = await readFile(new URL('../src/api.mjs',import.meta.url),'utf8');
await writeFile(new URL('../dist/server/index.js',import.meta.url),api + '\nconst assets = '+JSON.stringify(assets)+';\nexport default { async fetch(request, env) { const path = new URL(request.url).pathname; if (path.startsWith("/api/")) return handleApi(request,env); if (!["GET","HEAD"].includes(request.method)) return new Response("Method not allowed",{status:405}); const asset = assets[path]; if (!asset) return new Response("Not found",{status:404}); return new Response(request.method === "HEAD" ? null : asset[0],{headers:{"Content-Type":asset[1],"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\'; connect-src \'self\'; frame-ancestors \'none\'; base-uri \'none\'; form-action \'self\'","Permissions-Policy":"camera=(), microphone=(), geolocation=()"}}); } };\n');
console.log('Built dist/server/index.js (Worker ESM, no secrets bundled)');
