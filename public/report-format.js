import MarkdownIt from 'markdown-it';

const markdown=new MarkdownIt({html:false,breaks:true,linkify:false,typographer:false,maxNesting:20});
// 有些模型把结尾空格放在 ** 内部；只修复这种成对标记，不改代码或普通星号。
markdown.inline.ruler.before('emphasis','report_loose_strong',(state,silent)=>{
  const start=state.pos;
  if(state.src.slice(start,start+2)!=='**'||state.src[start-1]==='*'||state.src[start+2]==='*')return false;
  const end=state.src.indexOf('**',start+2);if(end<0||end+2>state.posMax||state.src[end+2]==='*')return false;
  const body=state.src.slice(start+2,end);
  if(!/^\S/.test(body)||!/[^\S\r\n]$/.test(body)||body.includes('\n')||!/[A-Za-z0-9\u3400-\u9fff]/.test(body))return false;
  if(!silent){
    state.push('strong_open','strong',1).markup='**';
    const children=[];state.md.inline.parse(body.trimEnd(),state.md,state.env,children);
    for(const token of children){token.level+=state.level;state.tokens.push(token);}
    state.push('strong_close','strong',-1).markup='**';
    state.push('text','',0).content=body.slice(body.trimEnd().length);
  }
  state.pos=end+2;return true;
});

export function reportTokens(source){return markdown.parse(String(source ?? ''),{});}
function inlineText(tokens=[]){
  return tokens.map(token=>['text','code_inline','image'].includes(token.type)?token.content:['softbreak','hardbreak'].includes(token.type)?'\n':token.children?inlineText(token.children):'').join('');
}
function tokensToPlain(tokens){
  let text='';const lists=[];
  const newline=(n=1)=>{const count=text.match(/\n*$/)[0].length;text+='\n'.repeat(Math.max(0,n-count));};
  for(const token of tokens){
    if(token.type==='inline')text+=inlineText(token.children);
    else if(token.type==='bullet_list_open'){newline();lists.push({ordered:false});}
    else if(token.type==='ordered_list_open'){newline();lists.push({ordered:true,next:Number(token.attrGet('start'))||1});}
    else if(token.type==='list_item_open'){newline();const list=lists[lists.length-1];text+='  '.repeat(Math.max(0,lists.length-1))+(list?.ordered?`${list.next++}. `:'• ');}
    else if(token.type==='list_item_close')newline();
    else if(['bullet_list_close','ordered_list_close'].includes(token.type)){lists.pop();newline(lists.length?1:2);}
    else if(token.type==='paragraph_close'&&!token.hidden)newline(2);
    else if(token.type==='heading_close'||token.type==='blockquote_close'||token.type==='hr')newline(2);
    else if(token.type==='code_block'||token.type==='fence'){newline();text+=token.content;newline(2);}
    else if(token.type==='td_close'||token.type==='th_close')text+='\t';
    else if(token.type==='tr_close'){text=text.replace(/\t+$/,'');newline();}
    else if(token.type==='table_close')newline(2);
  }
  return text.trim();
}
export function reportPlainText(source){return tokensToPlain(reportTokens(source));}
export function safeReportLink(href){
  if(typeof href!=='string'||!/^(https?:|mailto:)/i.test(href))return null;
  try{const url=new URL(href);if(!['https:','http:','mailto:'].includes(url.protocol)||url.username||url.password)return null;return url.href;}catch{return null;}
}
const tags=new Set(['p','strong','em','s','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','table','thead','tbody','tr','th','td']);
export function renderReportMarkdown(container,source){
  const document=container.ownerDocument,tokens=reportTokens(source);
  const fragment=document.createDocumentFragment();
  function render(parent,items){
    const stack=[parent];
    for(const token of items){
      const current=stack[stack.length-1];
      if(token.type==='inline'){render(current,token.children || []);continue;}
      if(token.type==='text'||token.type==='image'){current.append(document.createTextNode(token.content));continue;}
      if(token.type==='softbreak'||token.type==='hardbreak'){current.append(document.createElement('br'));continue;}
      if(token.type==='code_inline'){const code=document.createElement('code');code.textContent=token.content;current.append(code);continue;}
      if(token.type==='code_block'||token.type==='fence'){const pre=document.createElement('pre'),code=document.createElement('code');code.textContent=token.content;pre.append(code);current.append(pre);continue;}
      if(token.type==='hr'){current.append(document.createElement('hr'));continue;}
      if(token.nesting===-1){if(stack.length>1)stack.pop();continue;}
      if(token.nesting!==1)continue;
      if(token.hidden){stack.push(current);continue;}
      let element;
      if(token.type==='link_open'){
        const href=safeReportLink(token.attrGet('href'));element=document.createElement(href?'a':'span');
        if(href){element.href=href;element.target='_blank';element.rel='noopener noreferrer';}
      }else if(tags.has(token.tag)){
        element=document.createElement(token.tag);
        if(token.tag==='ol'){const start=Number(token.attrGet('start'));if(Number.isInteger(start)&&start>0&&start<=1000000)element.start=start;}
      }else{stack.push(current);continue;}
      if(token.tag==='table'){const wrapper=document.createElement('div');wrapper.className='report-table';wrapper.append(element);current.append(wrapper);}
      else current.append(element);
      stack.push(element);
    }
  }
  render(fragment,tokens);container.replaceChildren(fragment);container.classList.add('report-rich');
  return tokensToPlain(tokens);
}
