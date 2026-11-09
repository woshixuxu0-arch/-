import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateFile,checkDocxZip,MAX_FILE_BYTES} from '../public/file-rules.js';
test('文件大小、伪装格式、空文件及旧 DOC 校验',async()=>{
  for(const file of [new File(['content'],'x.doc'),new File([],'x.txt'),new File([new Uint8Array(MAX_FILE_BYTES+1)],'x.txt'),new File(['not PDF'],'x.pdf'),new File(['not PNG'],'x.png'),new File([new Uint8Array([0,1,2])],'x.txt')]) await assert.rejects(()=>validateFile(file));
  assert.equal(await validateFile(new File(['简历正文'],'x.txt')),'txt');
  assert.equal(await validateFile(new File(['%PDF-1.7\n'],'x.pdf')),'pdf');
});
test('损坏 DOCX 和 ZIP64 / 解压过大文档被拒绝',()=>{
  assert.throws(()=>checkDocxZip(new Uint8Array(10).buffer));
  const b=new ArrayBuffer(100);const v=new DataView(b);v.setUint32(78,0x06054b50,true);v.setUint16(88,1,true);v.setUint32(94,0,true);v.setUint32(0,0x02014b50,true);v.setUint32(24,25*1024*1024,true);
  assert.throws(()=>checkDocxZip(b),/解压后过大/);
});
