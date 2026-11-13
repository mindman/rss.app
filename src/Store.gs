/**
 * 保存済みウィジェットの永続化（Script Properties）。
 * 1 件 1KB 未満なので、Script Properties の上限 (500KB) で数百件は保存できる。
 * もっと増やしたい場合はスプレッドシート等に置き換える。
 */

var WIDGET_PREFIX_ = 'w:';

function newId_(len) {
  var chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + Date.now() + Math.random());
  var out = '';
  for (var i = 0; i < len; i++) out += chars[(bytes[i] + 256) % chars.length];
  return out;
}

/** @return {{config:Object, editKey:string, createdAt:string, updatedAt:string}|null} */
function loadWidgetRecord_(id) {
  if (!/^[A-Za-z0-9]{6,16}$/.test(String(id || ''))) return null;
  var raw = PropertiesService.getScriptProperties().getProperty(WIDGET_PREFIX_ + id);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function loadWidgetConfig_(id) {
  var rec = loadWidgetRecord_(id);
  return rec ? sanitizeConfig_(rec.config) : null;
}

/**
 * 新規保存または更新。更新時は editKey が一致する必要がある。
 * @return {{id:string, editKey:string}}
 */
function saveWidget_(config, id, editKey) {
  var clean = sanitizeConfig_(config);
  if (!clean.url) throw new Error('フィード URL が不正です');
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var now = new Date().toISOString();
    if (id) {
      var rec = loadWidgetRecord_(id);
      if (!rec || rec.editKey !== editKey) throw new Error('編集権限がありません');
      rec.config = diffFromDefault_(clean);
      rec.updatedAt = now;
      props.setProperty(WIDGET_PREFIX_ + id, JSON.stringify(rec));
      return { id: id, editKey: editKey };
    }
    var newId;
    do { newId = newId_(8); } while (props.getProperty(WIDGET_PREFIX_ + newId));
    var key = newId_(16);
    props.setProperty(WIDGET_PREFIX_ + newId, JSON.stringify({
      config: diffFromDefault_(clean), editKey: key, createdAt: now, updatedAt: now
    }));
    return { id: newId, editKey: key };
  } finally {
    lock.releaseLock();
  }
}
