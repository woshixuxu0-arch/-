import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importErrorMessage} from '../public/import-errors.js';
test('缺少浏览器接口与解析器异常提供可执行的中文提示',()=>{
  for(const message of ['a.toHex is not a function','Promise.withResolvers is not a function','Invalid PDF structure','Failed to fetch dynamically imported module']) {
    const result=importErrorMessage(new Error(message));assert.match(result,/[\u3400-\u9fff]/);assert.ok(!result.includes(message));assert.match(result,/粘贴/);
  }
});
test('保留已有的格式、大小与取消中文提示',()=>{
  for(const message of ['文件不能超过 10 MB，请压缩或分成较小文件。','已取消文件提取。','这不是 Word DOCX 文档。'])assert.equal(importErrorMessage(new Error(message)),message);
});
