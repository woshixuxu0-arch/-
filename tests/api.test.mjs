import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleApi,mockReport} from '../src/api.mjs';
const env = {DIFY_API_URL:'https://api.dify.ai/v1',DIFY_API_KEY:'test-server-secret',QUOTA_LEDGER:{idFromName:()=>0,get:()=>({fetch:async()=>Response.json({quota:{globalUsed:1}})})}};
const input = {resume:'真实简历内容与工作经历'.repeat(5),job_description:'岗位要求与工作职责描述'.repeat(5),consent:true};
const post = (body=input,headers={}) => new Request('https://jobfit.test/api/analyze',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:JSON.stringify(body)});
test('未配置密钥时明确返回演示状态，不暴露环境信息',async()=>{const r=await handleApi(new Request('https://jobfit.test/api/config'),{DIFY_API_URL:env.DIFY_API_URL});assert.equal((await r.json()).mode,'mock');assert.equal(r.headers.get('cache-control'),'no-store');});
test('演示无需提交简历，也不调用 Dify',async()=>{const r=await handleApi(post({}),{},()=>{throw Error('must not call');});assert.deepEqual(await r.json(),{mode:'mock',result:mockReport});});
test('真实模式只返回配置与保护状态，不返回密钥',async()=>{const text=await (await handleApi(new Request('https://jobfit.test/api/config'),env)).text();assert.equal(JSON.parse(text).mode,'live');assert.equal(JSON.parse(text).quotaProtected,true);assert.ok(!text.includes(env.DIFY_API_KEY));});
test('拒绝 GET 分析与跨域请求',async()=>{assert.equal((await handleApi(new Request('https://jobfit.test/api/analyze'),env)).status,405);assert.equal((await handleApi(post(input,{Origin:'https://evil.test'}),env)).status,403);});
test('检查内容类型、输入长度和明确同意',async()=>{assert.equal((await handleApi(post(input,{'Content-Type':'text/plain'}),env)).status,415);for (const body of [{...input,resume:'短'},{...input,job_description:'x'.repeat(20001)},{...input,consent:false},{...input,resume:[]}]) assert.equal((await handleApi(post(body),env)).status,400);});
test('拒绝声明及实际超限请求',async()=>{assert.equal((await handleApi(post({}, {'Content-Length':'180001'}),env)).status,413);assert.equal((await handleApi(post({a:'x'.repeat(180001)}),env)).status,413);});
test('错误 JSON 和 null 返回可理解错误',async()=>{for (const body of ['{', 'null']) {const r=await handleApi(new Request('https://jobfit.test/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body}),env);assert.equal(r.status,400);}});
test('正确调用现有工作流的两个输入与 result 输出',async()=>{
  let called=0;
  const r=await handleApi(post(),env,async(url,options)=>{called++;assert.equal(url,'https://api.dify.ai/v1/workflows/run');assert.equal(options.headers.Authorization,'Bearer test-server-secret');assert.equal(options.redirect,'manual');const payload=JSON.parse(options.body);assert.deepEqual(payload.inputs,{resume:input.resume,job_description:input.job_description});assert.equal(payload.response_mode,'blocking');assert.ok(payload.user);return Response.json({data:{status:'succeeded',outputs:{result:JSON.stringify(mockReport)}}});});
  const output=await r.json();assert.equal(called,1);assert.deepEqual(output.result,mockReport);assert.equal(output.quota.globalUsed,1);
});
test('识别五个 Markdown 标题并保留内容',async()=>{const md=Object.entries(mockReport).map(([k,v])=>`## ${k}\n${v}`).join('\n');const r=await handleApi(post(),env,async()=>Response.json({data:{status:'succeeded',outputs:{result:md}}}));assert.deepEqual((await r.json()).result,mockReport);});
test('未知文本格式保留原文，不补充不存在的内容',async()=>{const raw='<script>alert(1)</script>\n未能明确判断。';const r=await handleApi(post(),env,async()=>Response.json({data:{status:'succeeded',outputs:{result:raw}}}));assert.equal((await r.json()).result,raw);});
test('上游密钥、运行错误和内部响应不泄漏',async()=>{for (const status of [401,403,429,500]){const r=await handleApi(post(),env,async()=>new Response('secret-internal-upstream',{status}));const text=await r.text();assert.ok(r.status>=400);assert.ok(!text.includes('secret'));}});
test('失败运行和缺失 result 不伪装为成功',async()=>{for(const data of [{status:'failed',error:'private'},{status:'succeeded',outputs:{}},{status:'succeeded',outputs:{result:{unrelated:'value'}}}]){const r=await handleApi(post(),env,async()=>Response.json({data}));assert.equal(r.status,502);assert.ok(!(await r.text()).includes('private'));}});
test('拒绝不安全的服务端地址',async()=>{const r=await handleApi(post(),{...env,DIFY_API_URL:'http://api.dify.ai/v1'},()=>{throw Error();});assert.equal(r.status,503);});
test('网络错误不泄漏底层异常详情',async()=>{const r=await handleApi(post(),env,()=>{throw Error('secret transport detail');});assert.equal(r.status,502);assert.ok(!(await r.text()).includes('secret'));});
test('使用 Workers 支持的重定向模式，拒绝跟随跳转或暴露目标',async()=>{
  for(const status of [301,302,307,308]) {
    let calls=0;
    const r=await handleApi(post(),env,async(url,options)=>{
      calls++;
      if(!['manual','follow'].includes(options.redirect)) throw new TypeError('Unsupported redirect mode');
      assert.equal(options.redirect,'manual','密钥请求不得跟随重定向');
      return new Response(null,{status,headers:{Location:'https://other.test/private-token'}});
    });
    assert.equal(calls,1);assert.equal(r.status,502);
    const result=await r.json();assert.match(result.error,/重定向/);assert.ok(!JSON.stringify(result).includes('private-token'));
  }
});
