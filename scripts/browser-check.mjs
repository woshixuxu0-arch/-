import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {writeFile,mkdir} from 'node:fs/promises';
const root='/tmp/jobfit-browser-check';await mkdir(root,{recursive:true});
const zip=new JSZip();
zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX resume test: library volunteer organized books and borrowing records.</w:t></w:r></w:p></w:body></w:document>');
await writeFile(root+'/resume.docx',await zip.generateAsync({type:'nodebuffer'}));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const checks=[];
try {
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const fixtures=await context.newPage();
 await fixtures.setContent('<html><body style="font:24px sans-serif;padding:24px;width:650px"><h1>简历测试 Resume Test</h1><p>校园图书整理志愿服务</p><p>Library assistant volunteer experience.</p><p>Organized books and recorded borrowing information.</p><p>Good communication and attention to detail.</p></body></html>');
 await fixtures.pdf({path:root+'/text.pdf',format:'A4'});
 await fixtures.screenshot({path:root+'/resume.jpg',type:'jpeg',fullPage:true});
 const png=await fixtures.screenshot({path:root+'/resume.png',fullPage:true});
 await fixtures.setContent('<img style="width:650px" src="data:image/png;base64,'+png.toString('base64')+'">');
 await fixtures.pdf({path:root+'/scan.pdf',format:'A4'});await fixtures.close();
 const page=await context.newPage();const requests=[],errors=[];
 page.on('request',r=>requests.push({method:r.method(),url:r.url()}));page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3000/',{waitUntil:'networkidle'});
 assert.ok(await page.title().then(x=>x.includes('JobFit')));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push('390px 布局无横向溢出');
 async function upload(file,expected) {
   await page.locator('#resume-file').setInputFiles(file);
   await page.waitForFunction(()=>!document.querySelector('#preview-text').disabled && document.querySelector('#file-preview').open,{},{timeout:150000});
   const status=await page.locator('#file-status').textContent(),text=await page.locator('#preview-text').inputValue();
   assert.ok(text.length>20,`${file}: ${status}`);if(expected)assert.match(text,expected);if(file.endsWith('resume.png'))assert.match(text,/简历|图书|志愿/,'中文 OCR 应识别测试文本');
   assert.equal(await page.locator('#resume').inputValue(),'','确认前不替换正文');
   await page.locator('#confirm-file').click();assert.ok((await page.locator('#resume').inputValue()).length>20);
   await page.locator('#clear-all').click();checks.push(file.split('/').pop()+' 本地提取 / 预览确认');
 }
 await writeFile(root+'/resume.txt','这是测试简历，具有校园图书整理、借阅登记和沟通协调的志愿服务经历。');
 await upload(root+'/resume.txt',/校园图书/);
 await upload(root+'/resume.docx',/DOCX/);
 await upload(root+'/text.pdf',/Library assistant/);
 await upload(root+'/resume.jpg',/Resume|Library|assistant/i);
 await upload(root+'/resume.png',/Resume|Library|assistant/i);
 await upload(root+'/scan.pdf',/Resume|Library|assistant/i);
 await page.locator('#resume-file').setInputFiles({name:'fake.pdf',mimeType:'application/pdf',buffer:Buffer.from('this is not a PDF')});
 await page.waitForFunction(()=>!document.querySelector('#preview-text').disabled);
 assert.match(await page.locator('#file-status').textContent(),/不是有效 PDF/);await page.locator('#close-preview').click();checks.push('伪装格式被拒绝');
 assert.ok(requests.every(r=>new URL(r.url).origin==='http://127.0.0.1:3000'),'解析组件不得请求第三方域名');
 assert.ok(requests.every(r=>r.method==='GET'),'文件提取期间不得 POST 文件或文本');
 assert.deepEqual(errors,[]);checks.push('提取仅请求同源静态组件，无文件 / 文本上传');
 for(const width of [360,412]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push(width+'px 无横向溢出');}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:root+'/mobile.png',fullPage:true});
 console.log(JSON.stringify({checks,requests:requests.length,errors},null,2));
} finally {await browser.close();}
