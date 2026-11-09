const COOKIE = '__Host-jobfit_visitor';
const encoder = new TextEncoder();
const response = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function quotaDay(now=Date.now()) {
  const day=new Date(now+8*3600000).toISOString().slice(0,10);
  return {day,resetAt:new Date(Date.parse(day+'T00:00:00+08:00')+86400000).toISOString()};
}
export function networkPrefix(ip) {
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip.split('.').every(n=>Number(n)<=255)) return ip;
  if(!/^[\da-f:]+$/i.test(ip) || !ip.includes(':')) return null;
  const parts=ip.toLowerCase().split('::'); if(parts.length>2) return null;
  const left=parts[0]?parts[0].split(':'):[],right=parts[1]?parts[1].split(':'):[];
  const fields=parts.length===2?[...left,...Array(Math.max(0,8-left.length-right.length)).fill('0'),...right]:left;
  if(fields.length!==8 || fields.some(x=>!/^[\da-f]{1,4}$/.test(x))) return null;
  return fields.slice(0,4).map(x=>parseInt(x,16).toString(16)).join(':')+'::/64';
}
function limit(value,fallback) { const n=Number(value ?? fallback); if(!Number.isInteger(n)||n<0||n>100000) throw Error('limit'); return n; }
export async function quotaFor(request,env,action) {
  if(!env.QUOTA_LEDGER) throw Error('quota unavailable');
  const network=networkPrefix(request.headers.get('CF-Connecting-IP') || '');
  if(!network) throw Error('network unavailable');
  const token=(request.headers.get('Cookie') || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1) || '';
  const stub=env.QUOTA_LEDGER.get(env.QUOTA_LEDGER.idFromName('jobfit-global-v1'));
  let timer;
  try {return await Promise.race([stub.fetch('https://quota.internal/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({network,token,visitorLimit:limit(env.VISITOR_DAILY_LIMIT,3),globalLimit:limit(env.GLOBAL_DAILY_LIMIT,30)})}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('quota timeout')),5000);})]);} finally {clearTimeout(timer);}
}
export class QuotaLedger {
  constructor(state) {
    this.state=state; this.sql=state.storage.sql;
    state.blockConcurrencyWhile(async()=>{
      this.sql.exec('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS usage (day TEXT NOT NULL, kind TEXT NOT NULL, subject TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(day,kind,subject))');
      this.sql.exec('CREATE TABLE IF NOT EXISTS burst (subject TEXT PRIMARY KEY, bucket INTEGER NOT NULL, count INTEGER NOT NULL)');
      let secret=this.sql.exec('SELECT value FROM metadata WHERE key = ?', 'signing-key').toArray()[0]?.value;
      if(!secret) {secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');this.sql.exec('INSERT INTO metadata VALUES (?,?)','signing-key',secret);}
      this.key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
    });
  }
  async digest(value) {return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',this.key,encoder.encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
  async visitor(token) {
    const parts=token.split('.');
    if(parts.length===3 && /^[\da-f-]{36}$/.test(parts[0]) && /^\d{13}$/.test(parts[1]) && /^[\da-f]{64}$/.test(parts[2]) && Number(parts[1])>Date.now() && Number(parts[1])<Date.now()+31*86400000) {
      const signature=Uint8Array.from(parts[2].match(/../g),x=>parseInt(x,16));
      if(await crypto.subtle.verify('HMAC',this.key,signature,encoder.encode(parts[0]+'.'+parts[1]))) return {id:parts[0],token};
    }
    const id=crypto.randomUUID(),raw=id+'.'+(Date.now()+30*86400000);
    return {id,token:raw+'.'+await this.digest(raw)};
  }
  async fetch(request) {
    if(request.method!=='POST') return response({error:'请求方法不受支持。'},405);
    const action=new URL(request.url).pathname;
    if(!['/reserve','/usage'].includes(action)) return response({error:'接口不存在。'},404);
    try {
      const input=await request.json();
      const network=networkPrefix(input.network);
      // IPv6 前缀已经在外层归一化；不接收其他自由文本。
      if(!network && !/^[\da-f:]+::\/64$/i.test(input.network)) throw Error('network');
      const visitorLimit=limit(input.visitorLimit,3),globalLimit=limit(input.globalLimit,30);
      const identity=await this.visitor(typeof input.token==='string'?input.token:'');
      const {day,resetAt}=quotaDay(),ipKey=await this.digest('network:'+day+':'+input.network),visitorKey=await this.digest('visitor:'+day+':'+identity.id);
      const bucket=Math.floor(Date.now()/60000);
      const result=this.state.storage.transactionSync(()=>{
        this.sql.exec('DELETE FROM usage WHERE day < ?',new Date(Date.now()-7*86400000).toISOString().slice(0,10));
        this.sql.exec('DELETE FROM burst WHERE bucket < ?',bucket-2);
        const count=(kind,key)=>this.sql.exec('SELECT count FROM usage WHERE day=? AND kind=? AND subject=?',day,kind,key).toArray()[0]?.count || 0;
        let global=count('global',''),visitor=count('visitor',visitorKey),networkCount=count('network',ipKey);
        let status=200,error;
        if(action==='/reserve') {
          const burst=this.sql.exec('SELECT bucket,count FROM burst WHERE subject=?',ipKey).toArray()[0];
          const attempts=burst?.bucket===bucket?burst.count+1:1;
          this.sql.exec('INSERT INTO burst VALUES (?,?,?) ON CONFLICT(subject) DO UPDATE SET bucket=excluded.bucket,count=excluded.count',ipKey,bucket,attempts);
          if(attempts>6) {status=429;error='操作太频繁，请一分钟后再试。';}
          else if(global>=globalLimit) {status=429;error='今日全站 AI 分析额度已用完，请明天再来。';}
          else if(visitor>=visitorLimit || networkCount>=visitorLimit) {status=429;error='你或当前网络今日的分析额度已用完，请明天再来。共享网络会共用额度。';}
          else {
            for(const [kind,key] of [['global',''],['visitor',visitorKey],['network',ipKey]]) this.sql.exec('INSERT INTO usage VALUES (?,?,?,1) ON CONFLICT(day,kind,subject) DO UPDATE SET count=count+1',day,kind,key);
            global++;visitor++;networkCount++;
          }
        }
        return {status,error,quota:{day,resetAt,visitorLimit,visitorUsed:Math.max(visitor,networkCount),visitorRemaining:Math.max(0,visitorLimit-Math.max(visitor,networkCount)),globalLimit,globalUsed:global,globalRemaining:Math.max(0,globalLimit-global),policy:'reserved-attempts',timezone:'Asia/Shanghai'}};
      });
      const res=response({...(result.error?{error:result.error}:{}),quota:result.quota},result.status);
      res.headers.set('Set-Cookie',`${COOKIE}=${identity.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
      if(result.status===429) res.headers.set('Retry-After',result.error?.includes('一分钟')?'60':String(Math.max(1,Math.ceil((Date.parse(resetAt)-Date.now())/1000))));
      return res;
    } catch {return response({error:'额度保护暂时不可用，请稍后重试。'},503);}
  }
}
