export const MAX_FILE_BYTES=10*1024*1024;
export const MAX_TEXT=20000;
export function fileKind(name) {const ext=name.toLowerCase().split('.').pop();return ({pdf:'pdf',docx:'docx',txt:'txt',jpg:'image',jpeg:'image',png:'image'})[ext] || null;}
export async function validateFile(file) {
  const kind=fileKind(file.name);
  if(!kind) throw Error('仅支持 PDF、DOCX、TXT、JPG 和 PNG；旧版 DOC 请先另存为 DOCX。');
  if(!file.size) throw Error('文件为空，请重新选择。');
  if(file.size>MAX_FILE_BYTES) throw Error('文件不能超过 10 MB，请压缩或分成较小文件。');
  const bytes=new Uint8Array(await file.slice(0,1024).arrayBuffer());
  const starts=(signature)=>signature.every((n,i)=>bytes[i]===n);
  if(kind==='pdf' && !new TextDecoder().decode(bytes).includes('%PDF-')) throw Error('文件内容不是有效 PDF，请勿仅修改扩展名。');
  if(kind==='docx' && !starts([80,75,3,4])) throw Error('文件内容不是有效 DOCX，可能已损坏或被加密。');
  if(kind==='image' && !(file.name.toLowerCase().endsWith('.png')?starts([137,80,78,71,13,10,26,10]):starts([255,216,255]))) throw Error('图片格式与扩展名不符，请重新导出 JPG 或 PNG。');
  if(kind==='txt' && bytes.includes(0)) throw Error('TXT 似乎包含二进制内容，请另存为 UTF-8 文本。');
  return kind;
}
export function checkDocxZip(buffer) {
  const view=new DataView(buffer);let end=-1;
  for(let p=buffer.byteLength-22;p>=Math.max(0,buffer.byteLength-65557);p--) if(view.getUint32(p,true)===0x06054b50){end=p;break;}
  if(end<0) throw Error('DOCX 文件已损坏。');
  const count=view.getUint16(end+10,true);let offset=view.getUint32(end+16,true),total=0;const names=[];
  if(count>1000||count===0) throw Error('DOCX 内部文件过多，请另存为精简文档。');
  for(let i=0;i<count;i++) {
    if(offset+46>buffer.byteLength||view.getUint32(offset,true)!==0x02014b50) throw Error('DOCX 结构异常。');
    if(view.getUint16(offset+8,true)&1) throw Error('不支持加密 DOCX，请先移除密码。');
    total+=view.getUint32(offset+24,true);
    if(total>24*1024*1024) throw Error('DOCX 解压后过大，请移除大图片或拆分文件。');
    const len=view.getUint16(offset+28,true);if(offset+46+len>buffer.byteLength) throw Error('DOCX 结构异常。');
    names.push(new TextDecoder().decode(new Uint8Array(buffer,offset+46,len)));
    offset+=46+len+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);
  }
  if(!names.includes('word/document.xml')||!names.includes('[Content_Types].xml')) throw Error('这不是 Word DOCX 文档。');
}
