import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {handleApi} from './src/api.mjs';
const files = {'/':['index.html','text/html; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/icon.svg':['icon.svg','image/svg+xml']};
const root = fileURLToPath(new URL('./public/',import.meta.url));
const security = {'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cache-Control':'no-store'};
const active = new Map();
// 每实例最多两次并发真实分析；公开试用前还需在部署平台配置 IP 限速。
http.createServer(async (req,res) => {
  Object.entries(security).forEach(([key,value])=>res.setHeader(key,value));
  const path = req.url?.split('?')[0];
  if (path?.startsWith('/api/')) {
    const live = Boolean(process.env.DIFY_API_KEY && process.env.DIFY_API_URL), analysis = path === '/api/analyze' && req.method === 'POST';
    if (live && analysis && (active.get('global') || 0) >= 2) { res.writeHead(429,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'当前分析较多，请稍后重试。'}));return; }
    if (live && analysis) active.set('global',(active.get('global') || 0)+1);
    try {
      // 从反向代理协议还原 origin，Host 仅用于同源校验，不用于外部请求。
      const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const controller = new AbortController();
      res.on('close',()=>{ if (!res.writableEnded) controller.abort(); });
      const options = {method:req.method,headers:req.headers,signal:controller.signal};
      if (!['GET','HEAD'].includes(req.method)) { options.body = req; options.duplex = 'half'; }
      const response = await handleApi(new Request(`${proto}://${req.headers.host}${req.url}`,options),process.env);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
    } catch { res.writeHead(500,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'服务异常，请稍后重试。'})); }
    finally { if (live && analysis) active.set('global',Math.max(0,(active.get('global') || 1)-1)); }
    return;
  }
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  const asset = files[path];
  if (!asset) {res.writeHead(404);res.end('Not found');return;}
  try {const body = await readFile(root+asset[0]);res.writeHead(200,{'Content-Type':asset[1]});res.end(req.method === 'HEAD' ? undefined : body);} catch {res.writeHead(500);res.end('Service unavailable');}
}).listen(Number(process.env.PORT) || 3000,'0.0.0.0',()=>console.log('JobFit AI ready'));
