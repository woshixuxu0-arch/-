import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const base=process.env.TEST_URL || 'http://127.0.0.1:3000/';
const results=[];
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const fixture=await ctx.newPage();await fixture.setContent('<body style="font:26px sans-serif;padding:20px"><h1>Library Assistant</h1><p>Organize books and borrowing records.</p><p>Good communication and careful work.</p></body>');
 const image=await fixture.screenshot({fullPage:true});await fixture.close();
 const page=await ctx.newPage();const posts=[];let succeed=true;
 await page.route('**/api/config',r=>r.fulfill({json:{mode:'live',quotaProtected:true,version:'2.1.0'}}));
 await page.route('**/api/input-limits',r=>r.fulfill({json:{limits:{resume:20000,job_description:20000},source:'dify',confirmedFields:['resume','job_description']}}));
 await page.route('**/api/analyze',r=>{posts.push(r.request().postDataJSON());return r.fulfill(succeed?{json:{mode:'live',result:{岗位匹配:'这是模拟测试结果。',个人优势:'测试优势。',主要不足:'测试不足。',简历优化建议:'测试建议。',下一步行动:'测试行动。'}}}:{status:502,json:{error:'模拟上游失败，请稍后重试。'}});});
 await page.goto(base,{waitUntil:'networkidle'});
 const resumeText='【虚构简历测试】校园图书志愿者，负责书目整理、借阅登记、问题反馈和沟通协调。';
 const chooseResume=async(text=resumeText,name='resume.txt')=>{
  await page.locator('#resume-file').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(text)});
  await page.locator('#resume-file-info').filter({hasText:name}).waitFor();
 };
 async function typeJob(text='岗位测试：图书资料助理，负责整理图书和维护借阅记录，要求认真细致并能主动沟通。'){
  await page.locator('#job_description-editor').evaluate(el=>{el.open=true;});await page.locator('#job_description').fill(text);
 }
 await chooseResume();await page.locator('#job_description-file').setInputFiles({name:'job.png',mimeType:'image/png',buffer:image});
 await page.locator('#job_description-file-info').filter({hasText:'job.png'}).waitFor();
 assert.equal(await page.locator('#file-preview').evaluate(el=>el.open),false);assert.equal(await page.locator('#resume').inputValue(),'');assert.equal(posts.length,0);
 await page.locator('#analyze').click();assert.equal(posts.length,0);assert.match(await page.locator('#global-error').textContent(),/勾选/);results.push('未同意时不识别提交、不调用 AI');
 await page.locator('#consent').check();await page.locator('#analyze').click();
 await page.locator('#analysis-form').evaluate(el=>el.requestSubmit());
 await page.locator('#report').waitFor({state:'visible',timeout:150000});
 assert.equal(posts.length,1);assert.equal(posts[0].resume,resumeText);assert.match(posts[0].job_description,/Library|Assistant|borrowing/i);assert.equal(posts[0].consent,true);assert.deepEqual(Object.keys(posts[0]).sort(),['consent','job_description','resume']);assert.equal(await page.locator('#file-preview').evaluate(el=>el.open),false);results.push('简历文件 + 招聘图片：单击后自动识别、只提交文字、只调用一次');
 await page.locator('#clear-all').click();await chooseResume();await typeJob();await page.locator('#consent').check();succeed=false;await page.locator('#analyze').click();
 await page.locator('#global-error').waitFor({state:'visible'});assert.equal(posts.length,2);assert.match(await page.locator('#global-error').textContent(),/模拟上游失败/);assert.equal(await page.locator('#resume').inputValue(),resumeText);results.push('文件和文字可混用，上游失败仍保留输入');
 await page.locator('#clear-all').click();await chooseResume('PK\x03\x04not-a-real-docx','broken.docx');await typeJob();await page.locator('#consent').check();
 const count=posts.length;await page.locator('#analyze').click();await page.locator('#global-error').waitFor({state:'visible'});assert.match(await page.locator('#global-error').textContent(),/个人简历提取失败/);assert.equal(posts.length,count);results.push('文件解析失败时不提交分析');
 await page.locator('#clear-all').click();await chooseResume('文'.repeat(20001),'long.txt');await typeJob();await page.locator('#consent').check();await page.locator('#analyze').click();
 await page.locator('#resume-error').waitFor({state:'visible'});assert.equal(posts.length,count);assert.equal((await page.locator('#resume').inputValue()).length,20001);assert.equal(await page.locator('#resume-editor').evaluate(el=>el.open),true);
 await page.locator('#resume').fill(resumeText);succeed=true;await page.locator('#analyze').click();await page.locator('#report').waitFor({state:'visible'});assert.equal(posts.length,count+1);assert.equal(posts.at(-1).resume,resumeText);results.push('超长停止且不截断，修改后重试不被文件原文覆盖');
 await page.locator('#clear-all').click();await typeJob();
 await page.route('**/vendor/ocr/worker.min.js',async r=>{await new Promise(resolve=>setTimeout(resolve,2000));await r.continue().catch(()=>{});});
 await page.locator('#resume-file').setInputFiles({name:'cancel-image.png',mimeType:'image/png',buffer:image});await page.locator('#resume-file-info').filter({hasText:'cancel-image.png'}).waitFor();await page.locator('#consent').check();
 const beforeRecognizeCancel=posts.length;await page.locator('#analyze').click();await page.locator('#loading-status').waitFor({state:'visible'});await page.locator('#cancel').click();await page.locator('#global-error').waitFor({state:'visible'});assert.match(await page.locator('#global-error').textContent(),/已取消/);await page.waitForTimeout(2300);assert.equal(posts.length,beforeRecognizeCancel);assert.match(await page.locator('#resume-file-info').textContent(),/cancel-image/);results.push('识别中取消：不提交 AI，保留所选文件');
 await page.unroute('**/vendor/ocr/worker.min.js');
 await page.locator('#clear-all').click();await chooseResume();await typeJob();await page.locator('#consent').check();
 let cancelledRequests=0;
 await page.route('**/api/analyze',async r=>{cancelledRequests++;await new Promise(resolve=>setTimeout(resolve,1500));await r.fulfill({json:{mode:'live',result:'delay test'}}).catch(()=>{});});
 const beforeCancel=posts.length;await page.locator('#analyze').click();await page.locator('#loading-status').waitFor({state:'visible'});await page.locator('#cancel').click();await page.locator('#global-error').waitFor({state:'visible'});assert.match(await page.locator('#global-error').textContent(),/已取消/);assert.equal(await page.locator('#resume').inputValue(),resumeText);assert.equal(posts.length,beforeCancel);await page.waitForTimeout(1700);assert.ok(cancelledRequests<=1);results.push('取消操作后保留输入、不自动重试');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/jobfit-direct-upload-mobile.png',fullPage:true});
 console.log(JSON.stringify({checks:results,realDifyCalls:0},null,2));
}finally{await browser.close();}
