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

## デプロイ

[clasp](https://github.com/google/clasp)（Google 公式の GAS 用 CLI）を使ったデプロイツールを同梱しています。ファイルを手でコピーする必要はありません。

### 事前準備（最初に 1 回だけ）

- Node.js 20 以上
- <https://script.google.com/home/usersettings> で **「Google Apps Script API」をオン** にする（**clasp でログインするのと同じ Google アカウント**で。設定はアカウントごとです）

```bash
npm install
```

### 初回セットアップ

```bash
npm run setup
```

次の処理をまとめて実行します。

1. clasp にログイン（ブラウザが開くので Google アカウントで許可）
2. GAS プロジェクト「RSS Widget Maker」を作成し、`.clasp.json` に ID を保存
3. `src/` を push して、ウェブアプリとしてデプロイ（URL が表示されます）
4. 最後に表示される手順で、GAS エディタから `authorize` 関数を 1 回実行して権限を承認

> 既にある GAS プロジェクトを使う場合は `npm run setup -- --script-id <スクリプトID>` を実行してください。手動で作ったウェブアプリのデプロイが 1 つだけあれば、それを引き継ぎます（URL は変わりません）。

### 更新するとき

```bash
npm run deploy
```

`src/` を push して、**既存のデプロイを新バージョンに更新** します。ウェブアプリの URL は変わらないので、埋め込み済みのコードもそのまま動きます。バージョンの説明には `v1.0.0 <コミットID> (日時)` が自動で入ります。

| コマンド | 内容 |
| --- | --- |
| `npm run setup` | 初回セットアップ（ログイン → プロジェクト作成 → デプロイ） |
| `npm run deploy` | push して既存デプロイを更新 |
| `npm run deploy -- --deployment-id <ID>` | 更新するデプロイを指定（デプロイが複数ある場合） |
| `npm run status` | スクリプト ID・デプロイ ID・URL・デプロイ一覧を表示 |
| `npm run open` | GAS エディタを開く |
| `npm run account` | ログイン中の Google アカウントを表示 |
| `npm run switch-account` | 別の Google アカウントでログインし直す |
| `npm test` | ローカルでテスト |

設定は `.clasp.json`（git 管理外）に保存されます。

```json
{ "scriptId": "...", "rootDir": "src", "deploymentId": "..." }
```

### Google アカウントを切り替える

`npm run setup` で意図しないアカウントでログインしてしまった場合は、次を実行します。

```bash
npm run switch-account
```

1. 今のアカウントからログアウト
2. 再ログイン（ブラウザで使いたいアカウントを選ぶ）
3. 前のアカウントのプロジェクト設定 `.clasp.json` を `.clasp.json.bak` に退避

続けて `npm run setup` を実行すると、新しいアカウントに GAS プロジェクトを作ってデプロイします。前のアカウントにできたプロジェクトが不要なら <https://script.google.com/home> から削除してください。

> ブラウザが自動で前と同じアカウントを選んでしまう場合は、ターミナルに表示される認証 URL をコピーし、シークレットウィンドウか目的のアカウントの Chrome プロフィールで開いてください。URL の末尾に `&prompt=select_account` を付けると、アカウント選択画面を必ず表示できます。
>
> 新しいアカウントにも前のプロジェクトの編集権限を共有してあり、同じプロジェクトを使い続けたい場合は `npm run switch-account -- --keep-project` を使います。

### GitHub Actions で自動デプロイ

`.github/workflows/deploy.yml` が入っています。

- PR ごとにテストを実行
- `main` へマージ（push）されたら、テスト後に自動でデプロイ
- Actions 画面の「Run workflow」から手動でデプロイも可能

使うには、リポジトリの **Settings → Secrets and variables → Actions** に次の 3 つを登録します（未登録の間はデプロイをスキップし、テストだけ実行します）。

| シークレット | 値 |
| --- | --- |
| `CLASPRC_JSON` | ローカルで `npm run setup`（または `npx clasp login`）した後の `~/.clasprc.json` の中身すべて |
| `GAS_SCRIPT_ID` | `.clasp.json` の `scriptId`（`npm run status` でも表示） |
| `GAS_DEPLOYMENT_ID` | `.clasp.json` の `deploymentId` |

> `CLASPRC_JSON` はあなたの Google アカウントで GAS を操作できる認証情報です。共有リポジトリでは、デプロイ専用の Google アカウントでログインしたものを使うと安全です。トークンが失効した場合（パスワード変更など）は、再ログインして登録し直してください。

### 注意

- GAS のバージョンは 1 プロジェクトあたり 200 個までです。`npm run deploy` のたびに 1 つ増えるので、上限が近づいたら GAS エディタの「プロジェクトの履歴」から古いバージョンを削除してください
- 新しいデプロイを作ると URL が変わります。手動で操作する場合も「デプロイを管理」→ 既存のデプロイを編集 →「新バージョン」で更新してください

### 手動でデプロイする場合

1. <https://script.google.com/> で新しいプロジェクトを作成し、`src/` 内のファイルを同じ名前で作成して貼り付け（`.html` は拡張子なしの名前で「HTML」として作成。`appsscript.json` は「プロジェクトの設定」でエディタに表示させて上書き）
2. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」、実行ユーザー「自分」、アクセス「全員」
3. 初回は権限を承認する

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
scripts/deploy.mjs      デプロイツール（clasp のラッパー）
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

GAS の API を真似たエミュレータで、デプロイせずに動作を確認できます。フィードは `dev/fixtures/` のファイルを使います。

```bash
npm test
```

```bash
npm run dev
```

`http://127.0.0.1:8766/exec` でエディタ、`http://127.0.0.1:8766/host.html` で埋め込みのテストページが開きます。
