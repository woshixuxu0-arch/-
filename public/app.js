const $ = (id) => document.getElementById(id);
const titles = ['岗位匹配', '个人优势', '主要不足', '简历优化建议', '下一步行动'];
let mode = 'mock', ready = false, controller, reportText = '', revision = 0;
const example = {
  resume: '【虚构示例，仅用于体验】\n求职方向：产品运营\n教育背景：本科，市场营销专业。\n实习经历：参与校园活动运营，负责活动文案撰写、用户反馈整理及周报制作。\n项目经历：参与校园二手交易社群维护，整理常见问题并协助改进新用户指引。\n技能：Excel 基础表格整理、中文文案写作。\n说明：以上为演示材料，不代表任何真实用户经历。',
  job_description: '【虚构示例岗位】产品运营助理\n岗位职责：参与用户运营与活动策划，收集用户反馈，协助整理业务数据并输出复盘。\n任职要求：具备良好的沟通与文案能力，能够使用 Excel 整理数据，主动推进任务。\n加分项：了解用户分层与基础数据分析。'
};
function counts() {
  $('resume-count').textContent = `${$('resume').value.length.toLocaleString()} / 20,000`;
  $('job-count').textContent = `${$('job_description').value.length.toLocaleString()} / 20,000`;
}
function invalidate() {
  revision++; counts();
  if (!$('report').hidden) { $('report-note').textContent = '输入已修改。下方是上一次报告，请重新分析后使用。'; }
  $('global-error').hidden = true;
}
for (const [input, error] of [['resume','resume-error'],['job_description','job-error']]) {
  $(input).addEventListener('input', () => { invalidate(); $(error).hidden = true; $(input).removeAttribute('aria-invalid'); });
}
$('fill-example').addEventListener('click', () => { if (controller) return; for (const key in example) $(key).value = example[key]; invalidate(); });
function resetReport() { $('report').hidden = true; $('report-content').replaceChildren(); reportText = ''; $('copy-status').textContent = ''; }
$('clear-all').addEventListener('click', () => {
  controller?.abort(); for (const key in example) $(key).value = '';
  $('consent').checked = false; resetReport(); invalidate();
  for (const id of ['resume-error','job-error','global-error']) $(id).hidden = true;
  for (const id of ['resume','job_description']) $(id).removeAttribute('aria-invalid');
  $('resume').focus();
});
$('cancel').addEventListener('click', () => controller?.abort());
function busy(value) {
  $('analyze').disabled = value || !ready; $('fill-example').disabled = value;
  $('loading-status').hidden = !value; $('analysis-form').setAttribute('aria-busy', String(value));
  $('button-label').textContent = value ? '正在分析…' : mode === 'mock' ? '开始演示分析' : '开始匹配分析';
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
$('analysis-form').addEventListener('submit', async event => {
  event.preventDefault(); if (controller || !ready) return;
  let firstInvalid;
  for (const [input, error, label] of [['resume','resume-error','个人简历'],['job_description','job-error','岗位要求']]) {
    const length = $(input).value.trim().length;
    const message = length < 20 ? `请填写至少 20 个字符的${label}，以便获得有效分析。` : length > 20000 ? `${label}请控制在 20,000 个字符以内。` : '';
    $(error).textContent = message; $(error).hidden = !message;
    if (message) { $(input).setAttribute('aria-invalid','true'); firstInvalid ||= $(input); } else $(input).removeAttribute('aria-invalid');
  }
  if (firstInvalid) { firstInvalid.focus(); return; }
  if (mode === 'live' && !$('consent').checked) { $('global-error').textContent = '请先阅读并同意本次数据处理说明。'; $('global-error').hidden = false; $('consent').focus(); return; }
  $('global-error').hidden = true; resetReport(); controller = new AbortController(); const current = revision;
  const timeout = setTimeout(() => controller?.abort('timeout'), 125000);
  busy(true);
  try {
    // 演示不发送简历；服务端只返回固定结构示例。
    const payload = mode === 'mock' ? {} : {resume:$('resume').value.trim(), job_description:$('job_description').value.trim(), consent:$('consent').checked};
    const response = await fetch('/api/analyze', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:controller.signal, cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '暂时无法完成分析，请稍后重试。');
    if (current !== revision) throw new Error('分析期间输入已改变，请重新分析。');
    renderReport(data.result, data.mode === 'mock');
  } catch(error) {
    $('global-error').textContent = controller.signal.aborted ? (controller.signal.reason === 'timeout' ? '分析超时，请稍后重试或缩短输入内容。' : '已取消本次分析，输入内容仍保留在当前页面。') : (error instanceof TypeError || error instanceof SyntaxError ? '网络连接异常，请检查网络后重试。' : error.message);
    $('global-error').hidden = false;
  } finally { clearTimeout(timeout); controller = null; busy(false); }
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
    mode = config.mode; ready = true;
    if (mode === 'live') {
      $('mode-badge').textContent = '● Dify 接入模式'; $('mode-badge').classList.add('live');
      $('mode-notice').querySelector('p').textContent = '已配置 Dify · 首次分析时验证连接。提交前请去除个人敏感信息，内容将发送至 Dify 与工作流模型服务。';
      $('privacy-description').textContent = '本应用不持久化保存简历；Dify 及模型服务可能保留运行记录。刷新页面可清空当前内容。';
      $('consent-row').hidden = false;
    }
    busy(false);
  } catch { $('global-error').textContent = '无法获取服务状态，请刷新页面重试。'; $('global-error').hidden = false; }
}
// 不使用 localStorage、sessionStorage、IndexedDB、cookie 或分析埋点。
window.addEventListener('pageshow', event => { if (event.persisted) { for (const key in example) $(key).value = ''; resetReport(); counts(); } });
counts(); configure();
