import {mkdir,copyFile,cp,rm,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const at=(name)=>path.join(root,name);
await rm(at('dist'),{recursive:true,force:true});
await mkdir(at('dist/server'),{recursive:true});await mkdir(at('dist/client'),{recursive:true});
await build({entryPoints:[at('src/worker.mjs')],outfile:at('dist/server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
await build({entryPoints:[at('public/app.js')],outdir:at('dist/client'),bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',minify:true,chunkNames:'chunks/[name]-[hash]',legalComments:'linked'});
for(const file of ['index.html','style.css','icon.svg'])await copyFile(at('public/'+file),at('dist/client/'+file));
await mkdir(at('dist/client/vendor'),{recursive:true});
await build({entryPoints:[at('public/pdf-worker.js')],outfile:at('dist/client/vendor/pdf.worker.legacy.min.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'linked'});
for(const folder of ['cmaps','standard_fonts','wasm']) await cp(at('node_modules/pdfjs-dist/'+folder),at('dist/client/vendor/'+(folder==='wasm'?'pdf-wasm':folder)),{recursive:true});
await mkdir(at('dist/client/vendor/ocr'),{recursive:true});await mkdir(at('dist/client/vendor/lang'),{recursive:true});
await copyFile(at('node_modules/tesseract.js/dist/worker.min.js'),at('dist/client/vendor/ocr/worker.min.js'));
for(const suffix of ['lstm','simd-lstm','relaxedsimd-lstm']) for(const ext of ['wasm','wasm.js']) {
  const file=`tesseract-core-${suffix}.${ext}`;await copyFile(at('node_modules/tesseract.js-core/'+file),at('dist/client/vendor/ocr/'+file));
}
for(const lang of ['chi_sim','eng']) await copyFile(at(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`),at(`dist/client/vendor/lang/${lang}.traineddata.gz`));
await writeFile(at('dist/client/robots.txt'),'User-agent: *\nDisallow: /api/\n');
for(const [src,dest] of [['node_modules/pdfjs-dist/LICENSE','dist/client/vendor/PDFJS-LICENSE.txt'],['node_modules/tesseract.js-core/LICENSE','dist/client/vendor/ocr/CORE-LICENSE.txt'],['node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt','dist/client/vendor/ocr/worker.min.js.LICENSE.txt']])await copyFile(at(src),at(dest));
console.log('Built Worker, Durable Object and same-origin local PDF / DOCX / OCR assets; no environment secrets bundled.');
