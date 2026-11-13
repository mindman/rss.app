# RSS Widget Maker

RSS / Atom フィードの URL を入れるだけで、Web サイトに貼れる **8 種類のデザインのウィジェット** を作れる、RSS.app 風の簡易 SaaS です。
**Google Apps Script (GAS) だけで動く** ので、サーバー代 0 円・デプロイはボタン 1 つです。

## できること

- **フィード読み込み**: RSS 2.0 / RSS 1.0 (RDF) / Atom に対応
  - サイトの URL を入れると `<link rel="alternate">` からフィードを自動検出
  - Shift_JIS / EUC-JP のフィード、`&nbsp;` 入りの「ゆるい」XML も読める
  - サムネイルは `media:thumbnail` / `media:content` / `enclosure` / `hatena:imageurl` / 本文の最初の `<img>` から自動抽出
- **8 種類のデザイン**: リスト / カード / マガジン / カルーセル / ティッカー / コンパクト（ランキング風） / タイムライン / ギャラリー
- **カスタマイズ**: 記事数、列数、画像・日付・概要の表示切替、概要の文字数、日付形式（相対 / 日付 / 日時）、アクセントカラー、角丸、フォント、ライト / ダーク / 自動、背景透過、タイトル、ティッカー速度
- **ライブプレビュー**: PC / タブレット / スマホ幅、白 / 黒 / 透過背景で確認
- **3 種類の出力**
  - `<script>` タグ（推奨）… Shadow DOM で描画するので埋め込み先の CSS と干渉しない。高さも自動
  - `<iframe>` … script が使えない CMS 向け。高さ自動調整スニペット付き
  - JSON API … 正規化済みのフィードを JSON / JSONP で取得（自前デザイン用）
- **保存と編集**: 保存すると短い ID のコードになり、あとからデザインを変えても**埋め込み先は貼り替え不要**。編集は秘密キー付きの編集用 URL から

## デプロイ手順

### A. ブラウザだけでやる

1. <https://script.google.com/> で「新しいプロジェクト」を作成
2. `src/` 内のファイルをすべて同じ名前で作成して中身を貼り付け
   - `.gs` → 「スクリプト」、`.html` → 「HTML」（拡張子は付けずに `Editor`, `EditorScript`, `WidgetCss`, `WidgetRenderer`）
   - `appsscript.json` は「プロジェクトの設定」→「appsscript.json マニフェスト ファイルをエディタで表示する」をオンにして上書き
3. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
4. 初回は UrlFetch の権限を承認する
5. 発行された `https://script.google.com/macros/s/.../exec` を開くとエディタが表示される

### B. clasp を使う

```bash
npm i -g @google/clasp
```

```bash
clasp login
```

```bash
clasp create --type webapp --title "RSS Widget Maker" --rootDir src
```

```bash
clasp push
```

その後、A の手順 3 と同じようにウェブアプリとしてデプロイします（`.clasp.json.example` 参照）。

> コードを更新したら「デプロイを管理」→ 既存のデプロイを編集 →「新バージョン」にすると、**同じ URL のまま**反映されます（新しいデプロイを作ると URL が変わり、埋め込み済みコードが動かなくなります）。

## URL 仕様

| URL | 内容 |
| --- | --- |
| `/exec` | エディタ |
| `/exec?edit=ID&key=KEY` | 保存済みウィジェットの編集 |
| `/exec?mode=embed&id=ID` | `<script>` 埋め込み用 JS |
| `/exec?mode=frame&id=ID` | `<iframe>` 用 HTML |
| `/exec?mode=json&id=ID` | フィード JSON（`&callback=fn` で JSONP） |

`id` の代わりに設定をパラメータで直接渡すこともできます（保存不要）。両方指定した場合はパラメータが優先されます。

```
/exec?mode=embed&url=https%3A%2F%2Fzenn.dev%2Ffeed&theme=cards&columns=3&accent=%23e11d48&scheme=dark
```

| パラメータ | 値 | 既定値 |
| --- | --- | --- |
| `url` | フィード URL | （必須） |
| `theme` | `list` `cards` `magazine` `carousel` `ticker` `compact` `timeline` `gallery` | `list` |
| `count` | 1〜50 | 6 |
| `columns` | 1〜4（cards / carousel / gallery） | 3 |
| `showHeader` `showImage` `showDate` `showDesc` `newTab` `transparent` | `1` / `0` | 1（transparent のみ 0） |
| `descLength` | 0〜300 | 80 |
| `dateFormat` | `relative` `date` `datetime` | `relative` |
| `accent` | `#rgb` / `#rrggbb` | `#2563eb` |
| `radius` | 0〜32 (px) | 10 |
| `font` | `system` `sans` `serif` `rounded` `mono` | `system` |
| `scheme` | `light` `dark` `auto` | `light` |
| `title` | ヘッダーに出す名前 | フィード名 |
| `speed` | ティッカー速度 px/秒（10〜200） | 50 |

## 構成

```
src/
├── appsscript.json     マニフェスト（ウェブアプリ設定）
├── Code.gs             doGet のルーティング / google.script.run 用 API
├── Config.gs           設定の定義とサニタイズ
├── Feed.gs             フィード取得・パース・キャッシュ
├── Store.gs            ウィジェットの保存（Script Properties）
├── Editor.html         エディタ画面（HTML + CSS）
├── EditorScript.html   エディタの JS
├── WidgetRenderer.html ウィジェットのレンダラー（素の JS）
└── WidgetCss.html      ウィジェットの CSS
dev/                    ローカル用 GAS エミュレータとテスト（デプロイ対象外）
```

レンダラー（`WidgetRenderer` + `WidgetCss`）は 1 つにまとめられ、エディタのプレビュー・script 埋め込み・iframe 埋め込みのすべてで同じものを使っています。そのためプレビューと実際の表示は一致します。

## 仕組みと制限

- **キャッシュ**: フィードは `CacheService` に 15 分キャッシュ（`Config.gs` の `FEED_CACHE_SECONDS`）。同じフィードを表示するウィジェットが多くても UrlFetch はあまり呼ばれません
- **GAS のクォータ**: 無料アカウントで UrlFetch 20,000 回/日、同時実行 30 程度。個人ブログや社内ポータル程度なら十分ですが、大量 PV のサイトにはキャッシュ時間を延ばすか、JSON API を CDN 経由にするなどしてください
- **表示速度**: GAS の起動に 0.5〜2 秒ほどかかります。script 埋め込みは `async` なのでページ表示は止めません
- **保存件数**: Script Properties（合計 500KB）に保存するので数百件程度まで。もっと必要ならスプレッドシートに置き換えてください（`Store.gs` の 3 関数だけ）
- **セキュリティ**: フィード内容はすべてエスケープ・`http(s)` 以外のリンクは除去・設定値はサーバーとクライアントの両方でホワイトリスト検証しています。編集は保存時に発行される秘密キーが必要です
- **画像**: 画像は元サイトから直接読み込みます（`referrerpolicy="no-referrer"`）。読めない画像はプレースホルダーに置き換わります

## ローカルで動かす（開発用）

GAS の API をモックしたエミュレータで、デプロイせずに動作確認できます。フィードは `dev/fixtures/` のファイルを使います。

```bash
cd dev && npm install
```

```bash
npm test
```

```bash
npm start
```

`http://127.0.0.1:8766/exec` でエディタ、`http://127.0.0.1:8766/host.html` で埋め込みのテストページが開きます。
