import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportPlainText,reportTokens,safeReportLink} from '../public/report-format.js';
test('正常加粗与模型尾部空格标记都还原正文',()=>{
  assert.equal(reportPlainText('**文字整理能力**'),'文字整理能力');
  assert.equal(reportPlainText('结论：**明确符合一部分要求。 **'),'结论：明确符合一部分要求。');
  const inline=reportTokens('结论：**明确符合一部分要求。 **')[1].children;
  assert.ok(inline.some(t=>t.type==='strong_open'));assert.ok(!reportPlainText('**内容**').includes('**'));
});
test('标题、编号和分隔线可复制成易读纯文字',()=>{
  const text=reportPlainText('## 个人优势\n\n1. **文字整理**\n2. 团队协作\n\n---\n\n下一步行动');
  assert.match(text,/个人优势/);assert.match(text,/1\. 文字整理/);assert.match(text,/2\. 团队协作/);assert.ok(!text.includes('---'));assert.ok(!text.includes('**'));
});
test('保留真实星号、转义文字及代码内容',()=>{
  assert.equal(reportPlainText('SELECT * FROM table；2*3=6'),'SELECT * FROM table；2*3=6');
  assert.equal(reportPlainText('`**这里是代码**`'),'**这里是代码**');
  assert.equal(reportPlainText('\\*\\*保留字面星号\\*\\*'),'**保留字面星号**');
  assert.match(reportPlainText('```txt\na*b\n**代码**\n```'),/a\*b\n\*\*代码\*\*/);
});
test('仅允许安全的显式链接协议',()=>{
  for(const value of ['javascript:alert(1)','data:text/html,x','//other.test/pixel','https://user:password@example.com/','vbscript:msgbox(1)'])assert.equal(safeReportLink(value),null);
  assert.equal(safeReportLink('https://example.com/help'),'https://example.com/help');
});
