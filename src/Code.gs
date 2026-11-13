/**
 * エントリーポイント。Web アプリとしてデプロイすると以下の URL が使える。
 *
 *   /exec                       … エディタ（ウィジェット作成画面）
 *   /exec?edit=ID&key=KEY       … 保存済みウィジェットの編集
 *   /exec?mode=embed&id=ID      … <script> 埋め込み用 JavaScript
 *   /exec?mode=frame&id=ID      … <iframe> 埋め込み用 HTML
 *   /exec?mode=json&id=ID       … 正規化済みフィード JSON（callback= で JSONP）
 *
 * id の代わりに url=フィードURL&theme=cards… のようにパラメータを直接渡すこともできる。
 * id とパラメータを両方指定した場合はパラメータが優先される。
 */

function doGet(e) {
  var p = (e && e.parameter) || {};
  switch (p.mode) {
    case 'embed': return serveEmbed_(p);
    case 'frame': return serveFrame_(p);
    case 'json': return serveJson_(p);
    default: return serveEditor_(p);
  }
}

// ---------- 各モード ----------

function serveEditor_(p) {
  var t = HtmlService.createTemplateFromFile('Editor');
  t.bootstrap = jsonForScript_({
    baseUrl: ScriptApp.getService().getUrl(),
    defaults: DEFAULT_CONFIG,
    themes: THEMES,
    edit: p.edit && p.key ? { id: String(p.edit), key: String(p.key) } : null,
    initialUrl: coerce_(p.url || '', 'url') || ''
  });
  return t.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function serveEmbed_(p) {
  var r = resolve_(p);
  var js = '(function(){' + rendererBundle_() +
    'var s=document.currentScript;var el=document.createElement("div");' +
    'el.className="rss-widget-host";' +
    'if(s&&s.parentNode){s.parentNode.insertBefore(el,s);}else{document.body.appendChild(el);}' +
    'window.RSSWidget.mount(el,' + jsonForScript_(r.feed) + ',' + jsonForScript_(r.config) + ',' +
    jsonForScript_(r.error) + ');})();';
  return ContentService.createTextOutput(js).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function serveFrame_(p) {
  var r = resolve_(p);
  var html = '<!doctype html><html><head><meta charset="utf-8">' +
    '<style>html,body{margin:0;padding:0;background:transparent}</style></head><body>' +
    '<div id="rw"></div><script>' + rendererBundle_() +
    'window.RSSWidget.mount(document.getElementById("rw"),' + jsonForScript_(r.feed) + ',' +
    jsonForScript_(r.config) + ',' + jsonForScript_(r.error) + ');' +
    // 親ページ（埋め込み先）へ高さを通知。埋め込みコード側のスニペットで iframe の高さを合わせる
    '(function(){var last=0;function post(){var h=document.getElementById("rw").getBoundingClientRect().height;' +
    'h=Math.ceil(h);if(h&&h!==last){last=h;try{window.top.postMessage({type:"rss-widget:height",height:h},"*");}catch(e){}}}' +
    'if(window.ResizeObserver){new ResizeObserver(post).observe(document.getElementById("rw"));}' +
    'window.addEventListener("load",post);setTimeout(post,300);setTimeout(post,1500);})();' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle(r.feed && r.feed.title ? r.feed.title : APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function serveJson_(p) {
  var r = resolve_(p);
  var body = JSON.stringify({ ok: !r.error, error: r.error, feed: r.feed });
  var cb = String(p.callback || '');
  if (cb && /^[A-Za-z_$][\w$.]{0,63}$/.test(cb)) {
    return ContentService.createTextOutput('/**/' + cb + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/** id / クエリパラメータから設定を組み立ててフィードを取得する */
function resolve_(p) {
  var base = null;
  if (p.id) {
    base = loadWidgetConfig_(p.id);
    if (!base) return { config: sanitizeConfig_({}), feed: null, error: 'ウィジェットが見つかりません' };
  }
  var config = sanitizeConfig_(p, base || undefined);
  if (!config.url) return { config: config, feed: null, error: 'フィード URL が指定されていません' };
  try {
    return { config: config, feed: getFeed_(config.url), error: null };
  } catch (err) {
    return { config: config, feed: null, error: String(err && err.message || err) };
  }
}

// ---------- google.script.run から呼ばれる API ----------

function apiFetchFeed(url) {
  var clean = coerce_(url, 'url');
  if (!clean) throw new Error('http:// または https:// で始まる URL を入力してください');
  return getFeed_(clean);
}

function apiSaveWidget(config, id, editKey) {
  return saveWidget_(config, id || null, editKey || null);
}

function apiLoadWidget(id, editKey) {
  var rec = loadWidgetRecord_(id);
  if (!rec || rec.editKey !== editKey) throw new Error('ウィジェットが見つからないか、編集キーが違います');
  return sanitizeConfig_(rec.config);
}

// ---------- テンプレート用ユーティリティ ----------

/** HTML ファイルの中身をそのまま返す（テンプレートの include 用） */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/**
 * レンダラー（JS）とスタイル（CSS）をひとまとめにした JS を返す。
 * エディタのプレビュー・script 埋め込み・iframe 埋め込みのすべてで同じものを使う。
 */
function rendererBundle_() {
  var css = include('WidgetCss');
  var js = include('WidgetRenderer');
  return 'window.RSSWidget=window.RSSWidget||(function(CSS){' + js + '})(' + jsonForScript_(css) + ');';
}

/** <script> 内に安全に埋め込める JSON 文字列 */
function jsonForScript_(v) {
  return JSON.stringify(v === undefined ? null : v)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * 初回セットアップ用: GAS エディタからこの関数を 1 回実行して、
 * 外部 URL の取得（UrlFetchApp）などの権限を承認する。ウェブアプリ自体からは呼ばれない。
 */
function authorize() {
  UrlFetchApp.fetch('https://www.google.com/', { muteHttpExceptions: true });
  CacheService.getScriptCache().get('authorize');
  PropertiesService.getScriptProperties().getKeys();
  Logger.log('権限の承認が完了しました。ウェブアプリの URL を開いて動作を確認してください。');
}
