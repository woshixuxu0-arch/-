import {importErrorMessage} from './import-errors.js';
import {validateFile} from './file-rules.js';
const $=id=>document.getElementById(id);
const fields=['resume','job_description'];
const labels={resume:'个人简历',job_description:'岗位要求'};
const errorIds={resume:'resume-error',job_description:'job-error'};
const uploads={resume:null,job_description:null};
const selections={resume:0,job_description:0};
const selectionErrors={resume:'',job_description:''};
const titles=['岗位匹配','个人优势','主要不足','简历优化建议','下一步行动'];
let inputLimits={resume:20000,job_description:20000};
let mode='mock',ready=false,controller,reportText='',revision=0,importController,importTarget,previewItem;
const example = {
  resume: '【虚构示例，仅用于体验】\n求职方向：产品运营\n教育背景：本科，市场营销专业。\n实习经历：参与校园活动运营，负责活动文案撰写、用户反馈整理及周报制作。\n项目经历：参与校园二手交易社群维护，整理常见问题并协助改进新用户指引。\n技能：Excel 基础表格整理、中文文案写作。\n说明：以上为演示材料，不代表任何真实用户经历。',
  job_description: '【虚构示例岗位】产品运营助理\n岗位职责：参与用户运营与活动策划，收集用户反馈，协助整理业务数据并输出复盘。\n任职要求：具备良好的沟通与文案能力，能够使用 Excel 整理数据，主动推进任务。\n加分项：了解用户分层与基础数据分析。'
};
function counts(){
  $('resume-count').textContent=`${$('resume').value.length.toLocaleString()} / ${inputLimits.resume.toLocaleString()}`;
  $('job-count').textContent=`${$('job_description').value.length.toLocaleString()} / ${inputLimits.job_description.toLocaleString()}`;
}
function invalidate(){revision++;counts();$('global-error').hidden=true;if(!$('report').hidden)$('report-note').textContent='输入已修改。下方是上一次报告，请重新分析后使用。';}
function resetReport(){$('report').hidden=true;$('report-content').replaceChildren();reportText='';$('copy-status').textContent='';}
function updateUpload(target){
  const item=uploads[target];
  $(target+'-file-info').textContent=item?`${item.file.name} · ${(item.file.size/1024).toFixed(0)} KB · ${item.extracted?'已识别 '+$(target).value.length.toLocaleString()+' 字，可直接分析':'已选好，点击开始分析将自动读取'}`:'支持直接选文件分析，也可展开下方文字输入。';
  document.querySelector(`[data-preview="${target}"]`).hidden=!item;
  document.querySelector(`[data-remove-file="${target}"]`).hidden=!item;
}
function busy(value){
  $('analyze').disabled=value||!ready||Boolean(importController);$('fill-example').disabled=value||Boolean(importController);
  $('loading-status').hidden=!value;$('analysis-form').setAttribute('aria-busy',String(value));
  $('button-label').textContent=value?'正在处理…':mode==='mock'?'开始演示分析':'开始匹配分析';
  for(const field of fields){$(field).readOnly=value;$(field+'-force-ocr').disabled=value;}
  $('consent').disabled=value;
  for(const button of document.querySelectorAll('[data-upload],[data-preview],[data-remove-file]'))button.disabled=value||Boolean(importController);
}
function stage(title,note){$('loading-title').textContent=title;$('loading-note').textContent=note;}
function showFieldError(target,message){$(errorIds[target]).textContent=message;$(errorIds[target]).hidden=false;$(target).setAttribute('aria-invalid','true');}
function validateInputs(allowPending=false){
  let first;
  for(const field of fields){
    if(selectionErrors[field]){showFieldError(field,selectionErrors[field]);first ||= field;continue;}
    if(allowPending&&uploads[field]&&(!uploads[field].extracted||uploads[field].forceOCR!==$(field+'-force-ocr').checked))continue;
    const n=$(field).value.trim().length;
    const message=n<20?`请选择${labels[field]}文件，或填写至少 20 个字符的内容。`:n>inputLimits[field]?`${labels[field]}请控制在 ${inputLimits[field].toLocaleString()} 个字符以内（当前工作流上限）。`:'';
    if(message){showFieldError(field,message);first ||= field;}else{$(errorIds[field]).hidden=true;$(field).removeAttribute('aria-invalid');}
  }
  if(first){$(first+'-editor').open=true;$(first).focus();return false;}return true;
}
for(const field of fields){
  $(field).addEventListener('input',()=>{selectionErrors[field]='';invalidate();$(errorIds[field]).hidden=true;$(field).removeAttribute('aria-invalid');updateUpload(field);});
  $(field+'-force-ocr').addEventListener('change',()=>{if(uploads[field])uploads[field].extracted=false;updateUpload(field);invalidate();});
}
function clearAll(focus=true){
  controller?.abort('clear');closeImport();
  for(const field of fields){selections[field]++;selectionErrors[field]='';uploads[field]=null;$(field).value='';$(field+'-file').value='';$(field+'-force-ocr').checked=false;$(field+'-editor').open=false;$(errorIds[field]).hidden=true;$(field).removeAttribute('aria-invalid');updateUpload(field);}
  $('consent').checked=false;resetReport();invalidate();if(focus)document.querySelector('[data-upload="resume"]').focus();
}
$('clear-all').addEventListener('click',()=>clearAll());
$('fill-example').addEventListener('click',()=>{if(controller||importController)return;for(const field of fields){selections[field]++;selectionErrors[field]='';uploads[field]=null;$(field).value=example[field];$(field+'-editor').open=true;updateUpload(field);}invalidate();});
$('cancel').addEventListener('click',()=>controller?.abort());
async function parseUpload(target,signal,onProgress){
  const item=uploads[target];if(!item)return null;
  const forceOCR=$(target+'-force-ocr').checked;
  if(item.extracted&&item.forceOCR===forceOCR)return {text:$(target).value,method:item.method || '本地提取',item,forceOCR};
  const local=new AbortController();const relay=()=>local.abort(signal.reason);signal.addEventListener('abort',relay,{once:true});
  let rejectAbort;
  const cancelled=new Promise((_,reject)=>{rejectAbort=()=>reject(Error(local.signal.reason==='timeout'?'文件提取超时，请使用更小的文件。':'已取消文件提取。'));local.signal.addEventListener('abort',rejectAbort,{once:true});});
  const timer=setTimeout(()=>local.abort('timeout'),120000);
  try{
    if(signal.aborted)local.abort(signal.reason);
    const result=await Promise.race([import('./extract.js').then(({extractFile})=>extractFile(item.file,{signal:local.signal,forceOCR,onProgress})),cancelled]);
    if(signal.aborted||uploads[target]!==item)throw Error('已取消文件提取。');
    if(!result.text.trim())throw Error('未提取到文字，请换清晰的文件，或展开文字输入。');
    return {...result,item,forceOCR};
  }finally{clearTimeout(timer);signal.removeEventListener('abort',relay);local.signal.removeEventListener('abort',rejectAbort);}
}
function applyExtracted(target,result,text=result.text){
  if(!result||uploads[target]!==result.item)return;
  $(target).value=text;result.item.extracted=true;result.item.forceOCR=result.forceOCR;result.item.method=result.method;
  $(target).dispatchEvent(new Event('input',{bubbles:true}));updateUpload(target);
}
function renderReport(result, isMock) {
  resetReport();
  const sections = typeof result === 'object' && !Array.isArray(result) ? result : null;
  if (sections && titles.every(t => typeof sections[t] === 'string')) {
    titles.forEach((title, index) => {
      const card = document.createElement('article'); card.className = 'report-card';
      const heading = document.createElement('h3'), number = document.createElement('span');
      number.textContent = `0${index+1}`; heading.append(number, document.createTextNode(title));
      const content = document.createElement('div'); content.className = 'report-text'; content.textContent = sections[title];
      card.append(heading, content); $('report-content').append(card);
    });
    reportText = titles.map(t => `${t}\n${sections[t]}`).join('\n\n');
  } else {
    // 不猜测未知格式的内容或归属，保留 Dify 原始结果，绝不以 HTML 注入。
    const content = document.createElement('div'); content.className = 'report-text';
    content.textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    $('report-content').append(content); reportText = content.textContent;
  }
  $('report-note').textContent = isMock ? '演示报告 · 以下是固定结构示例，未分析你的输入。真实分析需连接 Dify；不生成虚构匹配分数。' : '本报告由已连接的 Dify 工作流生成。请核实每一项判断是否有简历原文依据。';
  reportText = `${$('report-note').textContent}\n\n${reportText}`;
  $('report').hidden = false; $('report').focus({preventScroll:true}); $('report').scrollIntoView({behavior:'smooth', block:'start'});
}
$('analysis-form').addEventListener('submit',async event=>{
  event.preventDefault();if(controller||importController||!ready)return;
  if(!validateInputs(true))return;
  if(mode==='live'&&!$('consent').checked){$('global-error').textContent='请先勾选本次数据处理同意。所选文件会在本地识别，提取的文字将发送至 Dify。';$('global-error').hidden=false;$('consent').focus();return;}
  $('global-error').hidden=true;resetReport();const own=new AbortController();controller=own;let timeout;busy(true);
  try{
    for(const field of fields){
      if(!uploads[field])continue;
      stage(`正在读取${labels[field]}…`,'自动提取完成后将继续分析，无需复制文字；可随时取消。');
      try{
        const result=await parseUpload(field,own.signal,message=>stage(`正在读取${labels[field]}…`,message));
        if(own.signal.aborted)throw Error('已取消');applyExtracted(field,result);
      }catch(error){if(own.signal.aborted)throw error;throw Error(`${labels[field]}提取失败：${importErrorMessage(error)}`);}
    }
    if(own.signal.aborted)throw Error('已取消');
    if(!validateInputs())return;
    const current=revision;
    stage('正在生成岗位匹配报告…','正在分析提供的文字，请保持页面打开。');
    $('button-label').textContent='正在分析…';timeout=setTimeout(()=>own.abort('timeout'),125000);
    const payload=mode==='mock'?{}:{resume:$('resume').value.trim(),job_description:$('job_description').value.trim(),consent:$('consent').checked};
    const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:own.signal,cache:'no-store'});
    const data=await response.json();
    if(!response.ok){if(data.limits)applyInputLimits({limits:data.limits,source:'dify'});throw Error(data.error || '暂时无法完成分析，请稍后重试。');}
    if(current!==revision)throw Error('分析期间输入已改变，请重新分析。');
    renderReport(data.result,data.mode==='mock');
  }catch(error){
    $('global-error').textContent=own.signal.aborted?(own.signal.reason==='timeout'?'分析超时，请稍后重试或缩短内容。':own.signal.reason==='clear'?'已清空内容并取消操作。':'已取消本次操作，文件与文字仍保留在当前页面。'):(error instanceof TypeError||error instanceof SyntaxError?'网络连接异常，请检查网络后重试。':error.message);
    $('global-error').hidden=false;
  }finally{clearTimeout(timeout);if(controller===own)controller=null;busy(false);await loadUsage();}
});
$('copy-result').addEventListener('click', async () => {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(reportText);
    else {
      const area = document.createElement('textarea'); area.value = reportText; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select();
      const ok = document.execCommand('copy'); area.remove(); if (!ok) throw new Error();
    }
    $('copy-status').textContent = '报告已复制，可粘贴到备忘录。';
  } catch { $('copy-status').textContent = '浏览器未允许复制，请长按报告文字手动选择复制。'; }
});
async function configure() {
  $('analyze').disabled = true;
  try {
    const response = await fetch('/api/config', {cache:'no-store'});
    if (!response.ok) throw new Error();
    const config = await response.json(); if (!['mock','live'].includes(config.mode)) throw new Error();
    mode = config.mode; ready = mode === 'mock' || config.quotaProtected;
    if(mode === 'live' && !ready) {$('global-error').textContent='额度保护尚未就绪，暂不能调用 AI。';$('global-error').hidden=false;}
    if (mode === 'live') {
      $('mode-badge').textContent = '● Dify 接入模式'; $('mode-badge').classList.add('live');
      $('mode-notice').querySelector('p').textContent = '已配置 Dify · 首次分析时验证连接。提交前请去除个人敏感信息，内容将发送至 Dify 与工作流模型服务。';
      $('privacy-description').textContent = '本应用不持久化保存简历；Dify 及模型服务可能保留运行记录。刷新页面可清空当前内容。';
      $('consent-row').hidden = false;
    }
    if(mode==='live')await refreshInputLimits();
    busy(false);
  } catch { $('global-error').textContent = '无法获取服务状态，请刷新页面重试。'; $('global-error').hidden = false; }
}
async function loadUsage() {
  try {
    const res=await fetch('/api/usage',{cache:'no-store'}),data=await res.json();
    if(!res.ok) throw Error(data.error || '无法读取额度');
    const q=data.quota;
    $('quota-status').textContent=`你 / 当前网络剩余 ${q.visitorRemaining} / ${q.visitorLimit} 次 · 全站已用 ${q.globalUsed} / ${q.globalLimit} 次。北京时间每天 00:00 重置；失败或取消也占用已预留次数。`;
  } catch(error) { $('quota-status').textContent=error.message || '额度暂不可用，请稍后刷新。'; }
}
$('refresh-quota').addEventListener('click',loadUsage);
const preview=$('file-preview');
function closeImport(){importController?.abort();importController=null;previewItem=null;preview.close();$('preview-text').value='';$('file-status').textContent='';busy(Boolean(controller));}
$('close-preview').addEventListener('click',closeImport);
preview.addEventListener('cancel',event=>{event.preventDefault();closeImport();});
function previewCount(){
  const n=$('preview-text').value.trim().length,max=inputLimits[importTarget] || 20000;
  $('preview-count').textContent=`${n.toLocaleString()} / ${max.toLocaleString()} 字符${n>max?'，超出当前工作流上限，请删减后保存':''}`;
  $('confirm-file').disabled=Boolean(importController)||n<1||n>max;
}
$('preview-text').addEventListener('input',previewCount);
for(const field of fields){
  document.querySelector(`[data-upload="${field}"]`).addEventListener('click',()=>{if(!controller&&!importController)$(field+'-file').click();});
  $(field+'-file').addEventListener('change',async()=>{
    const file=$(field+'-file').files[0];$(field+'-file').value='';if(!file||controller||importController)return;
    const ticket=++selections[field];
    try{await validateFile(file);if(ticket!==selections[field]||controller||importController)return;
      selectionErrors[field]='';uploads[field]={file,extracted:false};updateUpload(field);$(errorIds[field]).hidden=true;$(field).removeAttribute('aria-invalid');invalidate();
    }catch(error){if(ticket===selections[field]){selectionErrors[field]=importErrorMessage(error);showFieldError(field,selectionErrors[field]);}}
  });
  document.querySelector(`[data-remove-file="${field}"]`).addEventListener('click',()=>{if(controller||importController)return;selections[field]++;selectionErrors[field]='';uploads[field]=null;updateUpload(field);invalidate();$(field+'-editor').open=true;$(field).focus();});
  document.querySelector(`[data-preview="${field}"]`).addEventListener('click',async()=>{
    if(controller||importController||!uploads[field])return;
    importTarget=field;previewItem=null;const own=new AbortController();importController=own;
    $('preview-text').value='';$('preview-text').disabled=true;$('confirm-file').disabled=true;
    $('preview-title').textContent=`预览${labels[field]}（可选）`;$('file-status').textContent='正在本地读取文件…';preview.showModal();busy(false);
    try{
      const result=await parseUpload(field,own.signal,message=>{if(importController===own)$('file-status').textContent=message;});
      if(importController!==own)return;previewItem=result;$('preview-text').value=result.text;$('file-status').textContent=`${result.method}完成。可编辑后保存，或关闭预览直接分析。`;
    }catch(error){if(importController===own)$('file-status').textContent=importErrorMessage(error);}
    finally{if(importController===own){importController=null;$('preview-text').disabled=false;previewCount();busy(Boolean(controller));}}
  });
}
$('confirm-file').addEventListener('click',()=>{
  if(importController||$('confirm-file').disabled||!previewItem)return;
  applyExtracted(importTarget,previewItem,$('preview-text').value.trim());const target=importTarget;closeImport();$(target+'-editor').open=true;$(target).focus();
});
function applyInputLimits(data) {
  for(const key of ['resume','job_description']) {
    const limit=data.limits?.[key];if(Number.isInteger(limit)&&limit>=1&&limit<=20000){inputLimits[key]=limit;$(key).maxLength=limit;}
  }
  counts();if(preview.open)previewCount();
  const text=data.source==='dify'?`当前 Dify 工作流输入上限：简历 ${inputLimits.resume.toLocaleString()} 字符，岗位要求 ${inputLimits.job_description.toLocaleString()} 字符。超长请精简，或由管理员提高工作流变量上限并重新发布。`:'暂未读取到 Dify 变量限制；站点最多支持每项 20,000 字符，Dify 可能另有更低上限。';
  $('workflow-limits').textContent=text;$('workflow-limits').hidden=false;
}
async function refreshInputLimits() {
  try {const res=await fetch('/api/input-limits',{cache:'no-store'});if(!res.ok)throw Error();applyInputLimits(await res.json());}
  catch {applyInputLimits({limits:inputLimits,source:'site'});}
}
// 文件只保留在当前页面内存中；匿名额度 Cookie 不包含文件或简历。
window.addEventListener('pageshow',event=>{if(event.persisted)clearAll(false);});
for(const field of fields)updateUpload(field);
counts();configure();loadUsage();
