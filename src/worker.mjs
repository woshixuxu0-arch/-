import {handleApi} from './api.mjs';
export {QuotaLedger} from './quota.mjs';
const security={
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' blob: data:; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
export default {async fetch(request,env) {
  const path=new URL(request.url).pathname;
  let response;
  if(path.startsWith('/api/')) response=await handleApi(request,env);
  else {
    if(!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
    response=await env.ASSETS.fetch(request);
  }
  const res=new Response(response.body,response);
  for(const [key,value] of Object.entries(security)) res.headers.set(key,value);
  res.headers.set('X-JobFit-Version','2.0.2');
  if(path.startsWith('/api/')||path==='/'||path.endsWith('.html')||path==='/app.js')res.headers.set('Cache-Control','no-store');
  return res;
}};
