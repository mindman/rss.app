/**
 * フィードの取得・パース・キャッシュ。
 * RSS 2.0 / RSS 1.0 (RDF) / Atom に対応し、共通の JSON 形式に正規化する。
 *
 * 返却形式:
 * {
 *   title, link, description, fetchedAt,
 *   items: [{ title, link, date(ISO|null), desc, image, author }]
 * }
 */

var NS_ = {
  atom: 'http://www.w3.org/2005/Atom',
  media: 'http://search.yahoo.com/mrss/',
  content: 'http://purl.org/rss/1.0/modules/content/',
  dc: 'http://purl.org/dc/elements/1.1/'
};

/**
 * キャッシュ付きでフィードを取得する。
 * @param {string} url
 * @return {Object} 正規化済みフィード
 */
function getFeed_(url) {
  var cache = CacheService.getScriptCache();
  var key = 'feed:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url));
  var hit = cache.get(key);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* fallthrough */ }
  }
  var feed = fetchFeed_(url, 0);
  try {
    cache.put(key, JSON.stringify(feed), FEED_CACHE_SECONDS);
  } catch (e) {
    // 100KB を超えた場合などはキャッシュしない
  }
  return feed;
}

function fetchFeed_(url, depth) {
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    validateHttpsCertificates: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RSSWidgetMaker/1.0; +https://script.google.com)',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5'
    }
  });
  var code = res.getResponseCode();
  if (code >= 400) throw new Error('フィードの取得に失敗しました (HTTP ' + code + ')');

  var text = decodeBody_(res);

  // HTML が返ってきた場合は <link rel="alternate"> からフィードを自動検出する
  if (!looksLikeXmlFeed_(text)) {
    var found = discoverFeedUrl_(text, url);
    if (found && depth < 1) return fetchFeed_(found, depth + 1);
    throw new Error('RSS / Atom フィードが見つかりませんでした');
  }
  var feed = parseFeedXml_(text, url);
  feed.fetchedAt = new Date().toISOString();
  feed.source = url;
  return feed;
}

/** XML 宣言の encoding（Shift_JIS / EUC-JP など）を尊重してデコードする */
function decodeBody_(res) {
  var blob = res.getBlob();
  var head = blob.getDataAsString('ISO-8859-1').slice(0, 400);
  var m = head.match(/<\?xml[^>]*encoding=["']([\w.\-]+)["']/i) ||
          head.match(/<meta[^>]+charset=["']?([\w.\-]+)/i);
  var charset = m ? m[1] : null;
  if (!charset) {
    var ct = String(res.getHeaders()['Content-Type'] || res.getHeaders()['content-type'] || '');
    var m2 = ct.match(/charset=([\w.\-]+)/i);
    charset = m2 ? m2[1] : 'UTF-8';
  }
  try {
    return blob.getDataAsString(charset);
  } catch (e) {
    return blob.getDataAsString('UTF-8');
  }
}

function looksLikeXmlFeed_(text) {
  var head = text.slice(0, 2000).replace(/^﻿/, '');
  return /<(rss|feed|rdf:RDF)[\s>]/i.test(head);
}

function discoverFeedUrl_(html, baseUrl) {
  var re = /<link\b[^>]*>/gi, m;
  while ((m = re.exec(html))) {
    var tag = m[0];
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    var href = tag.match(/href=["']([^"']+)["']/i);
    if (href) return resolveUrl_(decodeEntities_(href[1]), baseUrl);
  }
  return null;
}

/**
 * XML 文字列をパースして正規化する（UrlFetch に依存しないのでテストしやすい）。
 */
function parseFeedXml_(text, baseUrl) {
  text = text.replace(/^﻿/, '').replace(/^\s+/, '');
  var doc;
  try {
    doc = XmlService.parse(text);
  } catch (e) {
    // &nbsp; などの HTML 実体参照や裸の & を含む「ゆるい」フィードを救済する
    doc = XmlService.parse(repairXml_(text));
  }
  var root = doc.getRootElement();
  var name = root.getName();
  if (name === 'feed') return parseAtom_(root, baseUrl);
  if (name === 'rss') return parseRss_(child_(root, 'channel'), child_(root, 'channel'), baseUrl);
  if (name === 'RDF') return parseRss_(child_(root, 'channel'), root, baseUrl);
  throw new Error('未対応のフィード形式です: ' + name);
}

function parseRss_(channel, itemParent, baseUrl) {
  if (!channel) throw new Error('channel 要素がありません');
  var link = text_(child_(channel, 'link')) || baseUrl;
  var feed = {
    title: cleanText_(text_(child_(channel, 'title'))),
    link: link,
    description: cleanText_(text_(child_(channel, 'description'))),
    items: []
  };
  children_(itemParent, 'item').slice(0, MAX_ITEMS).forEach(function (it) {
    var itemLink = text_(child_(it, 'link')) || guidLink_(it) || '';
    itemLink = resolveUrl_(itemLink.trim(), link);
    var html = text_(child_(it, 'encoded', NS_.content)) || text_(child_(it, 'description')) || '';
    var desc = text_(child_(it, 'description')) || html;
    var enclosure = children_(it, 'enclosure').filter(function (e) {
      return /^image\//i.test(attr_(e, 'type')) || /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(attr_(e, 'url'));
    })[0];
    feed.items.push({
      title: cleanText_(text_(child_(it, 'title'))) || '(無題)',
      link: itemLink,
      date: toIso_(text_(child_(it, 'pubDate')) || text_(child_(it, 'date', NS_.dc)) ||
                   text_(child_(it, 'updated'))),
      desc: cleanText_(desc),
      image: pickImage_(it, enclosure ? attr_(enclosure, 'url') : '', html, itemLink),
      author: cleanText_(text_(child_(it, 'creator', NS_.dc)) || text_(child_(it, 'author')))
    });
  });
  return feed;
}

function parseAtom_(root, baseUrl) {
  var feedLink = atomLink_(root) || baseUrl;
  var feed = {
    title: cleanText_(text_(child_(root, 'title'))),
    link: feedLink,
    description: cleanText_(text_(child_(root, 'subtitle'))),
    items: []
  };
  children_(root, 'entry').slice(0, MAX_ITEMS).forEach(function (en) {
    var link = resolveUrl_(atomLink_(en) || '', feedLink);
    var content = text_(child_(en, 'content', NS_.atom)) || '';
    var summary = text_(child_(en, 'summary')) || content;
    var author = child_(en, 'author');
    var enclosure = children_(en, 'link').filter(function (l) {
      return attr_(l, 'rel') === 'enclosure' && /^image\//i.test(attr_(l, 'type'));
    })[0];
    feed.items.push({
      title: cleanText_(text_(child_(en, 'title'))) || '(無題)',
      link: link,
      date: toIso_(text_(child_(en, 'published')) || text_(child_(en, 'updated'))),
      desc: cleanText_(summary),
      image: pickImage_(en, enclosure ? attr_(enclosure, 'href') : '', content || summary, link),
      author: author ? cleanText_(text_(child_(author, 'name'))) : ''
    });
  });
  return feed;
}

function atomLink_(el) {
  var links = children_(el, 'link', NS_.atom);
  var alt = links.filter(function (l) { return !attr_(l, 'rel') || attr_(l, 'rel') === 'alternate'; })[0];
  return alt ? attr_(alt, 'href') : '';
}

function guidLink_(it) {
  var g = child_(it, 'guid');
  var v = text_(g);
  return /^https?:\/\//.test(v) ? v : '';
}

/** 記事のサムネイル画像を優先順位付きで探す */
function pickImage_(el, enclosureUrl, html, baseUrl) {
  var candidates = [];
  var thumb = child_(el, 'thumbnail', NS_.media);
  if (thumb) candidates.push(attr_(thumb, 'url'));
  children_(el, 'content', NS_.media).forEach(function (c) {
    if (!attr_(c, 'medium') || attr_(c, 'medium') === 'image') candidates.push(attr_(c, 'url'));
  });
  var group = child_(el, 'group', NS_.media);
  if (group) {
    var gt = child_(group, 'thumbnail', NS_.media);
    if (gt) candidates.push(attr_(gt, 'url'));
    children_(group, 'content', NS_.media).forEach(function (c) { candidates.push(attr_(c, 'url')); });
  }
  if (enclosureUrl) candidates.push(enclosureUrl);
  // はてなブログ等の独自要素
  var hatena = child_(el, 'imageurl');
  if (hatena) candidates.push(text_(hatena));
  var m = String(html || '').match(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i);
  if (m) candidates.push(decodeEntities_(m[1]));

  for (var i = 0; i < candidates.length; i++) {
    var u = resolveUrl_(String(candidates[i] || '').trim(), baseUrl);
    if (/^https?:\/\//i.test(u) && !/(feedburner|pixel|tracking|1x1|spacer)/i.test(u)) return u;
  }
  return '';
}

// ---- XmlService ヘルパー（名前空間を気にせずローカル名で探す） ----

function children_(el, name, nsUri) {
  if (!el) return [];
  return el.getChildren().filter(function (c) {
    if (c.getName() !== name) return false;
    if (nsUri === undefined) return true;
    return c.getNamespace().getURI() === nsUri;
  });
}

function child_(el, name, nsUri) {
  if (!el) return null;
  // ns 未指定の場合は、拡張名前空間（media:content 等）より本体の要素を優先
  var list = children_(el, name, nsUri);
  if (nsUri === undefined && list.length > 1) {
    var plain = list.filter(function (c) {
      var u = c.getNamespace().getURI();
      return !u || u === NS_.atom || u === 'http://purl.org/rss/1.0/';
    });
    if (plain.length) return plain[0];
  }
  return list[0] || null;
}

function text_(el) {
  return el ? String(el.getValue() || '').trim() : '';
}

function attr_(el, name) {
  var a = el && el.getAttribute(name);
  return a ? String(a.getValue() || '') : '';
}

// ---- 文字列ユーティリティ ----

var ENTITIES_ = {
  nbsp: 160, copy: 169, reg: 174, trade: 8482, hellip: 8230, mdash: 8212, ndash: 8211,
  lsquo: 8216, rsquo: 8217, ldquo: 8220, rdquo: 8221, laquo: 171, raquo: 187, middot: 183,
  bull: 8226, yen: 165, euro: 8364, times: 215, deg: 176, amp: 38, lt: 60, gt: 62, quot: 34, apos: 39
};

function decodeEntities_(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, function (all, ent) {
    var code;
    if (ent[0] === '#') {
      code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
    } else {
      code = ENTITIES_[ent.toLowerCase()];
    }
    if (!code || code > 0x10FFFF) return all;
    try { return String.fromCodePoint(code); } catch (e) { return all; }
  });
}

/** HTML を除去してプレーンテキストにする */
function cleanText_(s) {
  s = String(s || '');
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
       .replace(/<br\s*\/?>|<\/p>/gi, ' ')
       .replace(/<[^>]*>/g, '');
  s = decodeEntities_(s);
  // 二重エスケープされたフィード対策でもう一度タグ除去
  s = s.replace(/<[^>]*>/g, '');
  return s.replace(/\s+/g, ' ').trim().slice(0, 600);
}

function repairXml_(text) {
  var xmlNamed = { amp: 1, lt: 1, gt: 1, quot: 1, apos: 1 };
  return text.replace(/&(#x[0-9a-f]+;|#\d+;|([a-z][a-z0-9]*);)?/gi, function (all, ent, name) {
    if (!ent) return '&amp;';
    if (!name || xmlNamed[name]) return all;
    var code = ENTITIES_[name.toLowerCase()];
    return code ? '&#' + code + ';' : '&amp;' + name + ';';
  });
}

function toIso_(s) {
  if (!s) return null;
  var d = new Date(s);
  if (isNaN(d.getTime())) {
    // "2024-01-02 03:04:05" のような形式
    d = new Date(String(s).replace(' ', 'T'));
  }
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function resolveUrl_(u, base) {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (/^\/\//.test(u)) return 'https:' + u;
  if (/^[a-z][a-z0-9+.\-]*:/i.test(u)) return ''; // javascript: / data: などは捨てる
  var m = String(base || '').match(/^(https?:\/\/[^\/?#]+)(\/[^?#]*)?/i);
  if (!m) return u;
  if (u[0] === '/') return m[1] + u;
  var dir = (m[2] || '/').replace(/[^\/]*$/, '');
  return m[1] + dir + u;
}
