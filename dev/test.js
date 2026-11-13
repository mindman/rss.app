// node dev/test.js — パーサー・設定・保存・各エンドポイントのテスト
const g=require('./gas-emulator.js');const assert=require('assert');
const f1=g.call('apiFetchFeed',['https://fx.test/rss2.xml']);
assert.equal(f1.items.length,4);assert.equal(f1.items[1].link,'',"javascript: link must be dropped");assert.ok(!/<|script/.test(f1.items[0].desc));
for (const u of ['https://fx.test/atom.xml','https://fx.test/rdf-sjis.xml','https://fx.test/loose.xml','https://fx.test/page.html']){
 const f=g.call('apiFetchFeed',[u]); console.log('\n==',u,'->',f.title,f.source); f.items.forEach(i=>console.log('  ',JSON.stringify(i)));}
try{g.call('apiFetchFeed',['https://fx.test/nothing.xml'])}catch(e){console.log('ERR ok:',e.message)}
try{g.call('apiFetchFeed',['javascript:alert(1)'])}catch(e){console.log('ERR ok:',e.message)}
// cache
const before=g.stats().fetchCount; g.call('apiFetchFeed',['https://fx.test/rss2.xml']); assert.equal(g.stats().fetchCount,before,'cache hit');
// config sanitize
const c=g.call('sanitizeConfig_',[{theme:'evil',accent:'red;}body{x',count:'999',showImage:'0',title:'<b>hi</b>',url:'https://a.b/c',scheme:'dark'}]);
console.log(c); assert.equal(c.theme,'list');assert.equal(c.accent,'#2563eb');assert.equal(c.count,50);assert.equal(c.scheme,'dark');assert.equal(c.showImage,false);
// store
const s=g.call('apiSaveWidget',[{url:'https://fx.test/atom.xml',theme:'cards'}]);console.log(s);
assert.equal(g.call('apiLoadWidget',[s.id,s.editKey]).theme,'cards');
assert.throws(()=>g.call('apiLoadWidget',[s.id,'wrong']));
g.call('apiSaveWidget',[{url:'https://fx.test/atom.xml',theme:'gallery'},s.id,s.editKey]);
assert.equal(g.call('apiLoadWidget',[s.id,s.editKey]).theme,'gallery');
assert.throws(()=>g.call('apiSaveWidget',[{url:'https://fx.test/atom.xml'},s.id,'bad']));
const j=JSON.parse(g.doGet({mode:'json',id:s.id}).content); assert.ok(j.ok); assert.equal(j.feed.title,'Atom ブログ');
const jp=g.doGet({mode:'json',id:s.id,callback:'cb'}).content; assert.ok(jp.startsWith('/**/cb('));
const bad=JSON.parse(g.doGet({mode:'json',id:'nope123'}).content); console.log(bad);
const e=g.doGet({mode:'embed',url:'https://fx.test/rss2.xml',theme:'cards'}).content; assert.ok(!/<\/script/i.test(e)); console.log('embed js bytes',e.length);
const fr=g.doGet({mode:'frame',id:s.id}).content; console.log('frame bytes',fr.length, (fr.match(/<\/script>/g)||[]).length,'closing script tags');
const ed=g.doGet({}).content; console.log('editor bytes',ed.length, /<\?/.test(ed)?'UNEVALUATED SCRIPTLET':'ok');
console.log('ALL OK');
