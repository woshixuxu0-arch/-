export const titles = ['岗位匹配', '个人优势', '主要不足', '简历优化建议', '下一步行动'];
export const mockReport = {
  岗位匹配: '【结构示例，非个人评估】\n真实报告应逐项对照岗位要求与简历原文，说明已有证据、尚缺证据及不能判断的部分。不在缺少依据时给出匹配分数。',
  个人优势: '【结构示例】\n真实报告将在这里引用简历中与岗位直接相关的经历，并说明它与哪条职责或要求有关。当前演示没有读取或评估你的经历。',
  主要不足: '【结构示例】\n真实报告应区分「简历未体现」与「能力不足」。缺少明确证据时，应提示补充信息，而不能断言你不具备某项能力。',
  简历优化建议: '【通用建议】\n1. 围绕目标岗位，把相关经历放在更容易看见的位置。\n2. 用「背景—行动—结果」描述真实贡献。\n3. 仅补充可核实的成果数据；没有数据时，说明交付物与实际影响，不编造数字。',
  下一步行动: '【通用行动清单】\n□ 检查简历中每项表述是否真实、具体。\n□ 为目标岗位的关键要求整理对应事例。\n□ 对缺少证据的要求，补充真实项目材料或制定学习计划。\n□ 连接 Dify 后重新分析，核对建议再投递。'
};
const headers = {
  'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer'
};
export function json(data, status = 200) { return new Response(JSON.stringify(data), {status, headers}); }
export function modeFor(env) { return env.DIFY_API_KEY?.trim() && env.DIFY_API_URL?.trim() ? 'live' : 'mock'; }
function parseResult(value) {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (titles.every(t => typeof value[t] === 'string' && value[t].trim())) return Object.fromEntries(titles.map(t => [t,value[t]]));
    throw new Error('format');
  }
  if (typeof value !== 'string' || !value.trim() || value.length > 150000) throw new Error('format');
  const stripped = value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try { const parsed = JSON.parse(stripped); if (parsed && titles.every(t => typeof parsed[t] === 'string' && parsed[t].trim())) return Object.fromEntries(titles.map(t => [t,parsed[t]])); } catch {}
  // 按明确的中文标题分区；标题不完整时保留原文，避免误分或捏造。
  const lines = value.split('\n'), sections = {}, preamble = []; let section;
  for (const line of lines) {
    const heading = line.trim().replace(/^#{1,6}\s*/, '').replace(/\*\*/g,'').replace(/^[一二三四五\d]+[、.．)）]\s*/, '').replace(/[：:]\s*$/, '');
    if (titles.includes(heading)) { section = heading; sections[section] ||= []; }
    else if (section) sections[section].push(line); else preamble.push(line);
  }
  if (titles.every(t => sections[t]?.join('\n').trim()) && !preamble.join('\n').trim()) return Object.fromEntries(titles.map(t => [t,sections[t].join('\n').trim()]));
  return value;
}
export async function handleApi(request, env = {}, fetcher = fetch) {
  const path = new URL(request.url).pathname;
  if (path === '/api/config') return request.method === 'GET' ? json({mode:modeFor(env)}) : json({error:'请求方法不受支持。'},405);
  if (path !== '/api/analyze') return json({error:'接口不存在。'},404);
  if (request.method !== 'POST') return json({error:'请使用 POST 请求。'},405);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({error:'不允许跨站请求。'},403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({error:'请使用 JSON 格式提交。'},415);
  if (Number(request.headers.get('content-length') || 0) > 180000) return json({error:'输入内容过长。'},413);
  let input;
  try {
    const reader = request.body?.getReader(); const chunks = []; let total = 0;
    if (!reader) return json({error:'请求内容为空。'},400);
    while (true) { const {done,value} = await reader.read(); if (done) break; total += value.byteLength; if (total > 180000) { await reader.cancel(); return json({error:'输入内容过长。'},413); } chunks.push(value); }
    const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
    input = JSON.parse(new TextDecoder().decode(bytes));
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
  } catch { return json({error:'请求内容格式有误。'},400); }
  if (modeFor(env) === 'mock') return json({mode:'mock',result:mockReport});
  for (const key of ['resume','job_description']) {
    if (typeof input[key] !== 'string' || input[key].trim().length < 20 || input[key].length > 20000) return json({error:'简历与岗位要求均须为 20–20,000 个字符。'},400);
  }
  if (input.consent !== true) return json({error:'提交前需要同意本次数据处理。'},400);
  let base;
  try { base = new URL(env.DIFY_API_URL); if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error(); } catch { return json({error:'服务端 Dify 地址配置有误，请联系管理员。'},503); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 115000);
  const abort = () => controller.abort(); request.signal.addEventListener('abort',abort,{once:true});
  try {
    const response = await fetcher(base.href.replace(/\/$/,'') + '/workflows/run', {
      method:'POST', redirect:'error', headers:{Authorization:`Bearer ${env.DIFY_API_KEY}`, 'Content-Type':'application/json'},
      body:JSON.stringify({inputs:{resume:input.resume.trim(),job_description:input.job_description.trim()},response_mode:'blocking',user:crypto.randomUUID()}),signal:controller.signal
    });
    if (!response.ok) {
      if (response.status === 429) return json({error:'分析服务繁忙或已达额度，请稍后重试。'},429);
      if ([401,403].includes(response.status)) return json({error:'Dify 服务认证失败，请管理员检查服务端密钥。'},502);
      return json({error:'Dify 暂时无法完成分析，请稍后重试。'},502);
    }
    const data = await response.json();
    if (data.data?.status !== 'succeeded') return json({error:'Dify 工作流执行未成功，请管理员检查工作流运行记录。'},502);
    const result = parseResult(data.data.outputs?.result);
    return json({mode:'live',result});
  } catch(error) {
    if (controller.signal.aborted) return json({error:'分析超时或已取消，请稍后重试。'},504);
    return json({error:error.message === 'format' ? '工作流未返回有效 result，请管理员检查输出配置。' : '无法连接分析服务，请稍后重试。'},502);
  } finally { clearTimeout(timer); request.signal.removeEventListener('abort',abort); }
}
