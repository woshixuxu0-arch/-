import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('构建 Worker 及本地 OCR 资源，无密钥打包',async()=>{
  const {default:worker}=await import('../dist/server/index.js');
  const assetEnv={ASSETS:{fetch:async()=>new Response('JobFit static asset')}};
  const r=await worker.fetch(new Request('https://jobfit.test/'),assetEnv);assert.equal(r.status,200);assert.ok(r.headers.get('content-security-policy').includes("'wasm-unsafe-eval'"));
  const config=await worker.fetch(new Request('https://jobfit.test/api/config'),{});assert.equal((await config.json()).mode,'mock');
  for(const path of ['vendor/ocr/worker.min.js','vendor/ocr/tesseract-core-lstm.wasm.js','vendor/lang/chi_sim.traineddata.gz','vendor/pdf.worker.legacy.min.mjs'])assert.ok((await readFile(new URL('../dist/client/'+path,import.meta.url))).length>100);
  const built=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');assert.ok(!built.includes('test-server-secret'));
});
