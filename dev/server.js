// ローカル確認用サーバー: node dev/server.js
const http=require('http'),url=require('url');const g=require('./gas-emulator.js');
const MOCK=`<script>window.google={script:{history:{replace:function(s,p){history.replaceState(null,'','?'+new URLSearchParams(p))}},run:(function mk(ok,fail){return new Proxy({},{get(_,k){
 if(k==='withSuccessHandler')return f=>mk(f,fail); if(k==='withFailureHandler')return f=>mk(ok,f);
 return (...args)=>fetch('/rpc',{method:'POST',body:JSON.stringify({fn:k,args})}).then(r=>r.json()).then(r=>{setTimeout(()=>r.error?fail&&fail(new Error(r.error)):ok&&ok(r.result),150)});}})})()}};</script>`;
http.createServer((req,res)=>{const u=url.parse(req.url,true);
 if(u.pathname==='/rpc'){let b='';req.on('data',d=>b+=d);req.on('end',()=>{const {fn,args}=JSON.parse(b);let r;try{r={result:g.call(fn,args)}}catch(e){r={error:e.message}}res.end(JSON.stringify(r));});return;}
 if(u.pathname==='/exec'){const o=g.doGet(u.query);let c=o.content;if(o.mime==='text/html'&&!u.query.mode)c=c.replace('<head>','<head>'+MOCK);
   res.writeHead(200,{'content-type':o.mime+'; charset=utf-8'});return res.end(c);}
 const img=u.pathname.match(/^\/img\/(\d+\.svg)$/);if(img){res.writeHead(200,{'content-type':'image/svg+xml'});return res.end(require('fs').readFileSync(__dirname+'/fixtures/img/'+img[1]));}
 if(u.pathname==='/host.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(require('fs').readFileSync(__dirname+'/host.html'));}
 res.writeHead(404);res.end();}).listen(8766,()=>console.log('editor: http://127.0.0.1:8766/exec\nhost page: http://127.0.0.1:8766/host.html'));
