const cache=new Map();
export const SITE_LIMITS={resume:20000,job_description:20000};
export const FIELD_LABELS={resume:'个人简历',job_description:'岗位要求'};
export function baseUrl(env) {
  const url=new URL(env.DIFY_API_URL);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('config');
  return url.href.replace(/\/$/,'');
}
export function parseInputLimits(data) {
  const limits={...SITE_LIMITS};const found=[];
  for(const form of Array.isArray(data?.user_input_form)?data.user_input_form:[]) {
    for(const type of ['paragraph','text-input','text_input']) {
      const field=form?.[type];
      if(!field || !Object.hasOwn(SITE_LIMITS,field.variable))continue;
      const n=Number(field.max_length);
      if(Number.isInteger(n)&&n>0&&n<=1000000) {limits[field.variable]=Math.min(SITE_LIMITS[field.variable],n);found.push(field.variable);}
    }
  }
  // 仅输出两个预定变量的数值限制，不转发默认值、选项或任何其他工作流配置。
  return found.length?{limits,source:'dify',confirmedFields:[...new Set(found)]}:null;
}
export async function readInputLimits(env,fetcher=fetch) {
  if(!env.DIFY_API_KEY || !env.DIFY_API_URL)return null;
  let controller,timer,key;
  try {
    const base=baseUrl(env);
    key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(base+'\n'+env.DIFY_API_KEY))),b=>b.toString(16).padStart(2,'0')).join('');
    const cached=cache.get(key);if(fetcher===fetch && cached?.expires>Date.now())return cached.value;
    controller=new AbortController();timer=setTimeout(()=>controller.abort(),5000);
    const res=await fetcher(base+'/parameters',{method:'GET',headers:{Authorization:`Bearer ${env.DIFY_API_KEY}`},redirect:'manual',signal:controller.signal});
    const value=res?.ok?parseInputLimits(await res.json()):null;
    if(fetcher===fetch){if(cache.size>=16)cache.clear();cache.set(key,{value,expires:Date.now()+(value?60000:10000)});}
    return value;
  } catch {return null;} finally {clearTimeout(timer);}
}
export function classifyDifyFailure(status,body={}) {
  const code=typeof body?.code==='string'?body.code:'';
  const message=typeof body?.message==='string'?body.message:typeof body?.error==='string'?body.error:'';
  // 原始上游错误可能含用户输入、模型信息和凭据，永不直接返回或打印。
  const text=(code+' '+message).toLowerCase();
  if([401,403].includes(status))return {status:502,code:'DIFY_AUTH_FAILED',error:'Dify 服务认证失败，请管理员检查该工作流的服务端密钥。'};
  if(/insufficient_quota|insufficient.{0,20}(credit|balance)|quota.{0,20}exceeded|余额不足|额度不足/.test(text))return {status:502,code:'DIFY_CREDIT_EXHAUSTED',error:'Dify 或模型服务的可用额度不足，请管理员检查模型余额和用量限制。'};
  if(status===429)return {status:429,code:'DIFY_RATE_LIMITED',error:'Dify 或模型服务暂时限流，请稍后重试。'};
  if(/workflow_not_published|workflow.{0,20}not.{0,10}published/.test(text))return {status:502,code:'DIFY_NOT_PUBLISHED',error:'Dify 工作流尚未发布，请管理员发布最新工作流后再试。'};
  if(status===400||['invalid_param','invalid_parameter','validation_error'].includes(code))return {status:400,code:'DIFY_INPUT_INVALID',error:'Dify 拒绝了输入内容。请检查工作流中 resume、job_description 的类型和长度上限，修改后重新发布工作流。'};
  if(status===404)return {status:502,code:'DIFY_ENDPOINT_NOT_FOUND',error:'未找到 Dify 工作流接口，请管理员核对 API 地址、应用类型与发布状态。'};
  if(status===200)return {status:502,code:'DIFY_WORKFLOW_FAILED',error:'Dify 工作流执行失败，请管理员查看 Dify 运行记录中的失败节点。'};
  return {status:502,code:'DIFY_UPSTREAM_ERROR',error:`Dify 服务返回异常（HTTP ${Number.isInteger(status)?status:502}），请稍后重试；持续失败时请管理员查看 Dify 运行记录。`};
}
