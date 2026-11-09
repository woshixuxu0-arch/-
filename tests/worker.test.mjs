import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('构建的 Worker 可提供页面、前端资源及演示 API',async()=>{
  await import('../scripts/build.mjs');
  const {default:worker}=await import('../dist/server/index.js');
  for(const path of ['/','/style.css','/app.js','/icon.svg']){const r=await worker.fetch(new Request('https://jobfit.test'+path),{});assert.equal(r.status,200);assert.ok((await r.text()).length>100);assert.ok(r.headers.get('content-security-policy'));}
  const config=await worker.fetch(new Request('https://jobfit.test/api/config'),{});assert.deepEqual(await config.json(),{mode:'mock'});
  const report=await worker.fetch(new Request('https://jobfit.test/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),{});assert.equal((await report.json()).mode,'mock');
  assert.equal((await worker.fetch(new Request('https://jobfit.test/.env'),{})).status,404);
  const built=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');assert.ok(!built.includes('test-server-secret'));
});
