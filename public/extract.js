import './pdf-compat.js';
import {validateFile,checkDocxZip} from './file-rules.js';
export async function extractFile(file,{signal,forceOCR=false,onProgress=()=>{}}={}) {
  let ocr,pdf,bitmap,loadingTask;
  const abort=()=>{ocr?.terminate();loadingTask?.destroy();bitmap?.close();};
  signal?.addEventListener('abort',abort,{once:true});
  const check=()=>{if(signal?.aborted) throw Error('已取消文件提取。');};
  let scanned=0;
  async function recognize(source) {
    check();
    if(!ocr) {
      onProgress('首次 OCR 需下载约 10 MB 中文识别组件，请稍候；文件不会上传。');
      const tesseract=await import('tesseract.js');const {createWorker}=tesseract.default || tesseract;check();
      ocr=await createWorker('chi_sim+eng',1,{workerPath:'/vendor/ocr/worker.min.js',corePath:'/vendor/ocr',langPath:'/vendor/lang',workerBlobURL:false,cacheMethod:'none',logger:m=>{if(m.status==='recognizing text')onProgress(`正在本地识别文字 ${Math.round((m.progress || 0)*100)}%`);}});
      check();
    }
    const result=await ocr.recognize(source);check();return result.data.text;
  }
  try {
    const kind=await validateFile(file);check();
    if(kind==='txt') {
      const data=await file.arrayBuffer();check();let text;
      try {text=new TextDecoder('utf-8',{fatal:true}).decode(data);} catch {text=new TextDecoder('gb18030').decode(data);}
      if(text.length>200000) throw Error('文本过长，请拆分文件。');
      return {text,method:'本地文本读取',scanned:0};
    }
    if(kind==='docx') {
      onProgress('正在本地读取 Word 文档…');const buffer=await file.arrayBuffer();check();checkDocxZip(buffer);
      const mammoth=await import('mammoth/mammoth.browser.js');check();
      const result=await (mammoth.default || mammoth).extractRawText({arrayBuffer:buffer});check();
      if(result.value.length>200000) throw Error('文本过长，请拆分文档。');
      return {text:result.value,method:'本地 Word 文本提取（嵌入图片不做 OCR）',scanned:0};
    }
    if(kind==='image') {
      const b=new Uint8Array(await file.arrayBuffer()),v=new DataView(b.buffer);let width=0,height=0;
      if(file.name.toLowerCase().endsWith('.png')) {width=v.getUint32(16);height=v.getUint32(20);}
      else {let pos=2;while(pos+9<b.length){if(b[pos]!==255)break;const marker=b[pos+1],size=v.getUint16(pos+2);if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){height=v.getUint16(pos+5);width=v.getUint16(pos+7);break;}if(size<2)break;pos+=2+size;}}
      if(!width||!height||width*height>40000000) throw Error('图片尺寸异常或超过 4000 万像素，请缩小后重试。');
      const initialScale=Math.min(1,2400/Math.max(width,height));
      bitmap=await createImageBitmap(file,{resizeWidth:Math.round(width*initialScale),resizeHeight:Math.round(height*initialScale),resizeQuality:'high'});check();const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();bitmap=null;
      return {text:await recognize(canvas),method:'本地中文 / 英文 OCR',scanned:1};
    }
    onProgress('正在本地加载 PDF…');
    // 同时使用主线程与 Worker 的官方兼容构建，为旧手机补齐 toHex 等接口。
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');check();pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.legacy.min.mjs';
    const loading=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,cMapUrl:'/vendor/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/standard_fonts/',wasmUrl:'/vendor/pdf-wasm/'});
    loadingTask=loading;
    // 不显示或记录文档内容，密码保护文档不在本版支持范围内。
    loading.onPassword=()=>{loading.destroy();};
    signal?.addEventListener('abort',()=>loading.destroy(),{once:true});
    pdf=await loading.promise;check();
    if(pdf.numPages>20) throw Error('PDF 最多支持 20 页，请拆分后重试。');
    const pages=[];let characterCount=0;
    for(let n=1;n<=pdf.numPages;n++) {
      check();onProgress(`正在提取 PDF 第 ${n} / ${pdf.numPages} 页…`);
      const page=await pdf.getPage(n),content=await page.getTextContent();check();
      let text=content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('').trim();
      if(forceOCR || text.replace(/\s/g,'').length<20) {
        if(++scanned>5) throw Error('单个文件最多识别 5 页扫描内容，请将扫描 PDF 拆分。');
        const natural=page.getViewport({scale:1}),scale=Math.min(2,2400/Math.max(natural.width,natural.height));
        const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;check();text=await recognize(canvas);canvas.width=canvas.height=1;
      }
      characterCount+=text.trim().length;
      pages.push(`【第 ${n} 页】\n${text}`);page.cleanup();
      if(pages.join('\n').length>200000) throw Error('PDF 文本过长，请拆分。');
    }
    if(!characterCount)throw Error('PDF 中未识别到文字，请使用更清晰的扫描件。');
    return {text:pages.join('\n\n'),method:scanned?'PDF 文本提取 + 本地 OCR':'本地 PDF 文本提取',scanned};
  } catch(error) {
    if(signal?.aborted) throw Error('已取消或提取超时，请选择更小的文件后重试。');
    if(error.name==='PasswordException') throw Error('PDF 有密码保护，请先移除密码。');
    throw error;
  } finally {abort();signal?.removeEventListener('abort',abort);}
}
