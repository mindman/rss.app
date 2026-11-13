// ローカル開発用の最小限の Google Apps Script エミュレータ。
// UrlFetchApp は dev/fixtures/ のファイルを返す（https://fx.test/<ファイル名> とサンプル URL を対応付け）。
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const {DOMParser}=require('@xmldom/xmldom');
const SRC=path.join(__dirname,'..','src')+'/', FX=path.join(__dirname,'fixtures');
const BASE=process.env.BASE||'http://127.0.0.1:8766/exec';
const URLMAP={'https://zenn.dev/feed':'rss2.xml','https://b.hatena.ne.jp/hotentry/it.rss':'rdf-sjis.xml','https://www.nhk.or.jp/rss/news/cat0.xml':'atom.xml','https://gigazine.net/news/rss_2.0/':'loose.xml','https://github.blog/feed/':'page.html'};
function fxFor(url){ if(URLMAP[url])return URLMAP[url]; const m=url.match(/^https:\/\/fx\.test\/(?:feeds\/)?([\w.\-]+)$/); return m&&m[1]; }
let fetchCount=0;
function wrapEl(n){return n&&{getName:()=>n.localName,getNamespace:()=>({getURI:()=>n.namespaceURI||''}),
 getChildren:()=>Array.from(n.childNodes).filter(c=>c.nodeType===1).map(wrapEl),
 getAttribute:(a)=>{const v=n.getAttribute(a);return n.hasAttribute(a)?{getValue:()=>v}:null},getValue:()=>n.textContent};}
function out(content){const o={content,mime:'text/html',setTitle(){return o},addMetaTag(){return o},setXFrameOptionsMode(){return o},setMimeType(m){o.mime=m;return o},getContent(){return o.content}};return o;}
const cache=new Map(),props=new Map();
const G={
 console,
 HtmlService:{XFrameOptionsMode:{ALLOWALL:'ALLOWALL',DEFAULT:'DEFAULT'},
  createHtmlOutputFromFile:(n)=>out(fs.readFileSync(SRC+n+'.html','utf8')),
  createHtmlOutput:(h)=>out(h),
  createTemplateFromFile:(n)=>{const t={evaluate(){const src=fs.readFileSync(SRC+n+'.html','utf8');
    return out(src.replace(/<\?(!?=)([\s\S]*?)\?>/g,(a,k,expr)=>{const v=vm.runInContext('(function(){return ('+expr+')})',ctx).call(null);
      // template vars
      return String(v);}));}};
    return new Proxy(t,{set(o,k,v){ctx[k]=v;return true;}});}},
 ContentService:{MimeType:{JAVASCRIPT:'application/javascript',JSON:'application/json'},createTextOutput:(s)=>out(s)},
 ScriptApp:{getService:()=>({getUrl:()=>BASE})},
 UrlFetchApp:{fetch:(url)=>{fetchCount++;const f=fxFor(url);if(!f)return {getResponseCode:()=>404,getBlob:()=>blob(Buffer.from('')),getHeaders:()=>({})};
   const buf=fs.readFileSync(path.join(FX,f));return {getResponseCode:()=>200,getBlob:()=>blob(buf),getHeaders:()=>({'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':'application/xml'}),getContentText:()=>buf.toString()};}},
 XmlService:{parse:(t)=>{const doc=new DOMParser({onError:(lvl,msg)=>{if(lvl!=='warning')throw new Error('XML parse: '+msg)}}).parseFromString(t,'text/xml');
   return {getRootElement:()=>wrapEl(doc.documentElement)};}},
 CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>{if(v.length>100000)throw new Error('too big');cache.set(k,v)}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>props.set(k,v)})},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 Utilities:{DigestAlgorithm:{MD5:'md5',SHA_256:'sha256'},computeDigest:(a,s)=>Array.from(crypto.createHash(a).update(String(s)).digest()).map(b=>b>127?b-256:b),
  base64EncodeWebSafe:(b)=>Buffer.from(b.map(x=>x&255)).toString('base64url'),getUuid:()=>crypto.randomUUID()}
};
function blob(buf){return {getDataAsString:(cs)=>{cs=(cs||'utf-8').toLowerCase();if(cs==='iso-8859-1')cs='latin1';return new TextDecoder(cs).decode(buf);}};}
const ctx=vm.createContext(G);
for(const f of fs.readdirSync(SRC).filter(f=>f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(SRC+f,'utf8'),ctx,{filename:f});
module.exports={ctx,doGet:(p)=>ctx.doGet({parameter:p}),call:(fn,args)=>ctx[fn].apply(null,args),stats:()=>({fetchCount}),cache,props};
