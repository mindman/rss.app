/**
 * ウィジェット設定の定義とサニタイズ。
 * 設定値は CSS や HTML に埋め込まれるため、必ず sanitizeConfig_ を通すこと。
 */

var APP_NAME = 'RSS Widget Maker';

/** フィードのキャッシュ秒数（CacheService の上限は 21600 秒） */
var FEED_CACHE_SECONDS = 15 * 60;

/** 1 フィードあたり保持する最大記事数 */
var MAX_ITEMS = 50;

var THEMES = ['list', 'cards', 'magazine', 'carousel', 'ticker', 'compact', 'timeline', 'gallery'];
var FONTS = ['system', 'sans', 'serif', 'rounded', 'mono'];
var MODES = ['light', 'dark', 'auto'];
var DATE_FORMATS = ['relative', 'date', 'datetime'];

var DEFAULT_CONFIG = {
  url: '',
  theme: 'list',
  title: '',
  count: 6,
  columns: 3,
  showHeader: true,
  showImage: true,
  showDate: true,
  showDesc: true,
  descLength: 80,
  dateFormat: 'relative',
  newTab: true,
  accent: '#2563eb',
  radius: 10,
  font: 'system',
  scheme: 'light',
  transparent: false,
  speed: 50
};

/** 設定のキー -> 型 */
var CONFIG_TYPES = {
  url: 'url', theme: 'enum:THEMES', title: 'text',
  count: 'int:1:50', columns: 'int:1:4',
  showHeader: 'bool', showImage: 'bool', showDate: 'bool', showDesc: 'bool',
  descLength: 'int:0:300', dateFormat: 'enum:DATE_FORMATS', newTab: 'bool',
  accent: 'color', radius: 'int:0:32', font: 'enum:FONTS', scheme: 'enum:MODES',
  transparent: 'bool', speed: 'int:10:200'
};

var ENUMS_ = { THEMES: THEMES, FONTS: FONTS, MODES: MODES, DATE_FORMATS: DATE_FORMATS };

/**
 * 任意のオブジェクト（クエリパラメータ等）から安全な設定を作る。
 * @param {Object} input
 * @param {Object=} base 上書き元（保存済み設定など）
 */
function sanitizeConfig_(input, base) {
  var out = {};
  var src = base || DEFAULT_CONFIG;
  Object.keys(DEFAULT_CONFIG).forEach(function (k) { out[k] = src[k] !== undefined ? src[k] : DEFAULT_CONFIG[k]; });
  input = input || {};
  Object.keys(CONFIG_TYPES).forEach(function (key) {
    if (input[key] === undefined || input[key] === null || input[key] === '') {
      if (key === 'title' && input[key] === '') out.title = '';
      return;
    }
    var v = coerce_(input[key], CONFIG_TYPES[key]);
    if (v !== undefined) out[key] = v;
  });
  return out;
}

function coerce_(raw, type) {
  var parts = type.split(':');
  var s = String(raw).trim();
  switch (parts[0]) {
    case 'bool':
      if (raw === true || s === '1' || s === 'true' || s === 'on') return true;
      if (raw === false || s === '0' || s === 'false' || s === 'off') return false;
      return undefined;
    case 'int':
      var n = parseInt(s, 10);
      if (isNaN(n)) return undefined;
      return Math.max(Number(parts[1]), Math.min(Number(parts[2]), n));
    case 'enum':
      return ENUMS_[parts[1]].indexOf(s) >= 0 ? s : undefined;
    case 'color':
      return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s) ? s.toLowerCase() : undefined;
    case 'url':
      return /^https?:\/\/[^\s"'<>]+$/i.test(s) && s.length <= 2000 ? s : undefined;
    case 'text':
      return s.replace(/[\u0000-\u001f]/g, '').slice(0, 120);
  }
  return undefined;
}

/** デフォルトと異なる値だけを返す（URL を短くするため） */
function diffFromDefault_(config) {
  var out = {};
  Object.keys(DEFAULT_CONFIG).forEach(function (k) {
    if (config[k] !== DEFAULT_CONFIG[k]) out[k] = config[k];
  });
  return out;
}
