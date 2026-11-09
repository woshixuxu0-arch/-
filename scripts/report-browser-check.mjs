import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const report='## 个人优势\n\n1. **文字整理能力**\n   - 依据：参与内容整理与核对。\n   - 结论：**符合一部分要求。 **\n\n---\n\n## 下一步行动\n\n- 核实原有项目证据。\n- 代码示例：`SELECT * FROM demo`，计算 2*3=6。\n\n| 项目 | 说明 |\n| --- | --- |\n| 文本 | 保留原文 |\n\n[帮助](https://example.com/help)\n\n<script>window.__reportXss=1</script>\n<img src="https://example.invalid/pixel" onerror="window.__reportXss=2">\n\n![插图说明](https://example.invalid/tracker)\n\n[危险](javascript:alert(1))';
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 if(process.env.LEGACY_BROWSER_TEST==='1')await context.addInitScript(()=>{for(const [target,keys] of [[Uint8Array.prototype,['toHex','toBase64']],[Uint8Array,['fromHex','fromBase64']],[Promise,['withResolvers']],[Map.prototype,['getOrInsert','getOrInsertComputed']],[WeakMap.prototype,['getOrInsert','getOrInsertComputed']],[ArrayBuffer.prototype,['transfer','transferToFixedLength']]])for(const key of keys)Reflect.deleteProperty(target,key);});
 await context.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedReport=text;}}});});
 const page=await context.newPage(),requests=[],errors=[];page.on('request',r=>requests.push({method:r.method(),url:r.url()}));page.on('pageerror',e=>errors.push(String(e)));
 const base=process.env.TEST_URL || 'http://127.0.0.1:3000/';
 await page.goto(base,{waitUntil:'networkidle'});
 await page.locator('#open-report-format').click();await page.locator('#existing-report').fill(report);await page.locator('#format-existing-report').click();
 await page.locator('#report').waitFor({state:'visible'});
 assert.equal(await page.locator('#report-content strong').first().textContent(),'文字整理能力');
 assert.equal(await page.locator('#report-content strong').nth(1).textContent(),'符合一部分要求。');
 assert.equal(await page.locator('#report-content ol').count(),1);assert.equal(await page.locator('#report-content hr').count(),1);assert.equal(await page.locator('#report-content h2').count(),2);assert.equal(await page.locator('#report-content table').count(),1);
 assert.equal(await page.locator('#report-content script,#report-content img,#report-content iframe').count(),0);assert.equal(await page.evaluate(()=>window.__reportXss),undefined);
 assert.equal(await page.locator('#report-content a[href^="javascript:"]').count(),0);assert.equal(await page.locator('#report-content a').first().getAttribute('rel'),'noopener noreferrer');
 assert.ok(!(await page.locator('#report-content').textContent()).includes('**'));
 await page.locator('#copy-result').click();const plain=await page.evaluate(()=>window.__copiedReport);
 assert.ok(!plain.includes('**'));assert.ok(!plain.includes('---'));assert.match(plain,/1\. 文字整理能力/);assert.match(plain,/SELECT \* FROM demo/);assert.match(plain,/2\*3=6/);
 assert.ok(requests.every(r=>r.method==='GET'),'排版旧报告不得提交分析');assert.ok(requests.every(r=>new URL(r.url).origin===new URL(base).origin),'报告不得自动加载第三方图片');
 for(const width of [360,390,412]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.screenshot({path:'/tmp/jobfit-report-format.png',fullPage:true});
 // 新生成的五段结构化结果也使用相同的格式渲染器。
 await page.route('**/api/analyze',r=>r.fulfill({json:{mode:'live',result:{岗位匹配:'结论：**符合部分要求。 **',个人优势:'1. **文字能力**',主要不足:'- 需补充证据',简历优化建议:'保留原文',下一步行动:'核对后行动'}}}));
 await page.locator('#fill-example').click();await page.locator('#analyze').click();await page.locator('#report-content .report-card').first().waitFor();
 assert.equal(await page.locator('#report-content .report-card').count(),5);assert.equal(await page.locator('#report-content strong').first().textContent(),'符合部分要求。');
 assert.deepEqual(errors,[]);
 console.log('通过：中文加粗、宽松标记、列表、分隔线、表格、纯文字复制、360/390/412px、五段报告；旧报告排版0次AI调用，HTML和远程图片不执行。');
}finally{await browser.close();}
