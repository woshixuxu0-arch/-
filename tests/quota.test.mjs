import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Miniflare} from 'miniflare';
import {handleApi} from '../src/api.mjs';
import {quotaDay,networkPrefix} from '../src/quota.mjs';
test('北京时间日期边界和 IPv6 /64 归一化',()=>{
  assert.equal(quotaDay(Date.parse('2026-11-09T15:59:59Z')).day,'2026-11-09');
  assert.equal(quotaDay(Date.parse('2026-11-09T16:00:00Z')).day,'2026-11-10');
  assert.equal(networkPrefix('2001:db8::1'),networkPrefix('2001:0db8:0000:0000:1111:2222:3333:4444'));
  assert.equal(networkPrefix('999.1.1.1'),null);
});
test('缺少额度绑定或计数服务失败时不得调用 Dify 工作流',async()=>{
  let calls=0;
  const req=()=>new Request('https://jobfit.test/api/analyze',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({resume:'r'.repeat(25),job_description:'j'.repeat(25),consent:true})});
  const env={DIFY_API_URL:'https://api.dify.ai/v1',DIFY_API_KEY:'synthetic-test-key'};
  assert.equal((await handleApi(req(),env,(url,options)=>{if(options.method==='POST')calls++;return Response.json({user_input_form:[]});})).status,503);
  assert.equal((await handleApi(req(),{...env,QUOTA_LEDGER:{idFromName:()=>0,get:()=>({fetch:()=>{throw Error();}})}},(url,options)=>{if(options.method==='POST')calls++;return Response.json({user_input_form:[]});})).status,503);
  assert.equal(calls,0);
});
test('真实 SQLite Durable Object：并发硬上限、身份防绕过、重启后保留计数',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'jobfit-quota-'));
  const create=()=>new Miniflare({scriptPath:'dist/server/index.js',modules:true,compatibilityDate:'2026-01-01',durableObjects:{QUOTA_LEDGER:{className:'QuotaLedger',useSQLite:true}},durableObjectsPersist:dir,serviceBindings:{ASSETS:()=>new Response('test')}});
  let mf=create();
  try {
    const namespace=await mf.getDurableObjectNamespace('QUOTA_LEDGER');
    const stub=namespace.get(namespace.idFromName('concurrent'));
    const call=(target,network,token='',action='reserve')=>target.fetch('https://quota/'+action,{method:'POST',body:JSON.stringify({network,token,visitorLimit:3,globalLimit:30})});
    const results=await Promise.all(Array.from({length:100},(_,i)=>call(stub,`192.0.2.${i+1}`)));
    assert.equal(results.filter(r=>r.status===200).length,30);
    const usage=await (await call(stub,'192.0.2.250','','usage')).json();assert.equal(usage.quota.globalUsed,30);
    const identity=namespace.get(namespace.idFromName('identity'));
    const first=await call(identity,'198.51.100.1');const cookie=first.headers.get('set-cookie').split(';')[0].split('=').slice(1).join('');
    assert.ok(first.headers.get('set-cookie').includes('HttpOnly; Secure'));
    assert.equal((await call(identity,'198.51.100.2',cookie)).status,200);
    assert.equal((await call(identity,'198.51.100.3',cookie)).status,200);
    assert.equal((await call(identity,'198.51.100.4',cookie)).status,429,'换 IP 但保留 Cookie 不能增加额度');
    assert.equal((await call(identity,'198.51.100.1')).status,200);
    assert.equal((await call(identity,'198.51.100.1','tampered.token.value')).status,200);
    assert.equal((await call(identity,'198.51.100.1')).status,429,'清 Cookie 仍受网络额度约束');
    const ipv6=namespace.get(namespace.idFromName('ipv6'));
    assert.equal((await call(ipv6,'2001:db8:0:0::/64')).status,200);
    await mf.dispose();mf=create();
    const ns2=await mf.getDurableObjectNamespace('QUOTA_LEDGER');
    const persisted=await (await call(ns2.get(ns2.idFromName('concurrent')),'203.0.113.1','','usage')).json();assert.equal(persisted.quota.globalUsed,30);
  } finally {await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
