import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseInputLimits,readInputLimits,classifyDifyFailure} from '../src/dify.mjs';
import {handleApi} from '../src/api.mjs';
const parameters={user_input_form:[{paragraph:{variable:'resume',max_length:1000,default:'private-default'}},{paragraph:{variable:'job_description',max_length:1000}},{'text-input':{variable:'internal_secret',max_length:10,default:'private-value'}}]};
const credentials={DIFY_API_URL:'https://api.dify.ai/v1',DIFY_API_KEY:'synthetic-private-key'};
test('只读取两个预定文本变量的数值限制，不暴露工作流默认值',()=>{
  const result=parseInputLimits(parameters);assert.deepEqual(result.limits,{resume:1000,job_description:1000});assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes('internal_secret'));
  assert.equal(parseInputLimits({unrelated:'private'}),null);
});
test('读取参数使用服务端认证且不会执行工作流',async()=>{
  let calls=0;
  const result=await readInputLimits(credentials,async(url,options)=>{calls++;assert.equal(url,'https://api.dify.ai/v1/parameters');assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer synthetic-private-key');return Response.json(parameters);});
  assert.equal(calls,1);assert.equal(result.limits.resume,1000);
  assert.equal(await readInputLimits(credentials,async()=>new Response('private',{status:401})),null);
});
test('超出已发布工作流长度时，在扣额度和调用 AI 前拒绝',async()=>{
  let ai=0,reservations=0;
  const env={...credentials,QUOTA_LEDGER:{idFromName:()=>0,get:()=>({fetch:()=>{reservations++;return Response.json({quota:{}});}})}};
  const request=new Request('https://jobfit.test/api/analyze',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({resume:'r'.repeat(1001),job_description:'j'.repeat(1159),consent:true})});
  const response=await handleApi(request,env,async(url,options)=>{if(options.method==='GET')return Response.json(parameters);ai++;return Response.json({});});
  const result=await response.json();assert.equal(response.status,400);assert.equal(result.code,'DIFY_INPUT_TOO_LONG');assert.match(result.error,/1,000/);assert.equal(ai,0);assert.equal(reservations,0);
});
test('参数接口只返回安全限制，不消耗分析额度',async()=>{
  const res=await handleApi(new Request('https://jobfit.test/api/input-limits'),credentials,async()=>Response.json(parameters));
  const body=await res.text();assert.equal(res.status,200);assert.ok(!body.includes(credentials.DIFY_API_KEY));assert.ok(!body.includes('private-default'));assert.equal(JSON.parse(body).limits.job_description,1000);
});
test('区分参数、认证、额度、未发布及服务错误，不转发原始错误',()=>{
  for(const [status,body,code] of [[400,{message:'job_description secret-input must be shorter'},'DIFY_INPUT_INVALID'],[401,{message:'secret-key'},'DIFY_AUTH_FAILED'],[429,{},'DIFY_RATE_LIMITED'],[500,{code:'workflow_not_published'},'DIFY_NOT_PUBLISHED'],[500,{message:'insufficient credits private-detail'},'DIFY_CREDIT_EXHAUSTED'],[404,{},'DIFY_ENDPOINT_NOT_FOUND'],[500,{message:'private traceback'},'DIFY_UPSTREAM_ERROR']]) {
    const result=classifyDifyFailure(status,body);assert.equal(result.code,code);assert.match(result.error,/[\u3400-\u9fff]/);assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes('secret'));
  }
});
