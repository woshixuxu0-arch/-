import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});let posts=0;
 await page.route('**/api/config',route=>route.fulfill({json:{mode:'live',quotaProtected:true,version:'2.1.0'}}));
 await page.route('**/api/input-limits',route=>route.fulfill({json:{limits:{resume:1000,job_description:1000},source:'dify',confirmedFields:['resume','job_description']}}));
 await page.route('**/api/analyze',route=>{posts++;return route.fulfill({status:400,json:{error:'Dify 拒绝了输入内容，请管理员检查变量设置。',code:'DIFY_INPUT_INVALID'}});});
 await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3000/',{waitUntil:'networkidle'});
 assert.equal(await page.locator('#job_description').getAttribute('maxlength'),'1000');
 await page.locator('#resume-editor > summary').click();
 await page.locator('#job_description-editor > summary').click();
 await page.locator('#resume').fill('简历测试内容'.repeat(10));
 await page.evaluate(()=>{const field=document.querySelector('#job_description');field.value='j'.repeat(1159);field.dispatchEvent(new Event('input'));});
 await page.locator('#consent').check();await page.locator('#analyze').click();
 assert.equal(posts,0);assert.match(await page.locator('#job-error').textContent(),/1,000/);
 assert.equal((await page.locator('#job_description').inputValue()).length,1159,'已有文本不得静默截断');
 await page.locator('#job_description').fill('岗位测试要求'.repeat(10));await page.locator('#analyze').click();
 await page.locator('#global-error').waitFor({state:'visible'});assert.equal(posts,1);assert.match(await page.locator('#global-error').textContent(),/检查变量/);
 assert.ok((await page.locator('#resume').inputValue()).length>20);
 console.log('浏览器通过：工作流上限同步、超长阻止发送、不静默截断、中文错误显示、失败保留输入。');
}finally{await browser.close();}
