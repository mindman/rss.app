#!/usr/bin/env node
/**
 * clasp を使った GAS デプロイツール。
 *
 *   npm run setup    初回セットアップ（ログイン → GAS プロジェクト作成 → 初回デプロイ）
 *   npm run deploy   src/ を push して、既存のウェブアプリのデプロイを新バージョンに更新（URL は変わらない）
 *   npm run status   設定内容とデプロイ一覧を表示
 *   npm run open     GAS エディタをブラウザで開く
 *   npm run account  ログイン中の Google アカウントを表示
 *   npm run switch-account  別の Google アカウントでログインし直す
 *
 * 設定は .clasp.json（git 管理外）に保存する:
 *   { "scriptId": "...", "rootDir": "src", "deploymentId": "..." }
 * 環境変数 GAS_SCRIPT_ID / GAS_DEPLOYMENT_ID があればそちらを優先する（CI 用）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLASP_JSON = path.join(ROOT, '.clasp.json');
const CLASP_BIN = process.env.CLASP_BIN || path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'clasp.cmd' : 'clasp');
const TITLE = 'RSS Widget Maker';

const args = process.argv.slice(2);
const cmd = args[0] || 'deploy';
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`
};
const step = (s) => console.log('\n' + c.bold('▶ ' + s));

function fail(msg, hint) {
  console.error('\n' + c.red('✖ ' + msg));
  if (hint) console.error(c.yellow(hint));
  process.exit(1);
}

/**
 * clasp を実行する。出力は常に取り込んで表示する（エラー時にヒントを出すため）。
 * interactive=true（login など）のときだけ端末に直結する。capture=true なら出力を表示せず返す。
 */
function clasp(claspArgs, { capture = false, interactive = false, cwd = ROOT, allowFail = false } = {}) {
  if (!fs.existsSync(CLASP_BIN)) fail('clasp が見つかりません', '先に `npm install` を実行してください。');
  console.log(c.dim('$ clasp ' + claspArgs.join(' ')));
  const r = spawnSync(CLASP_BIN, claspArgs, {
    cwd,
    stdio: interactive ? 'inherit' : ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (!interactive && (!capture || r.status !== 0)) process.stdout.write(out);
  if (r.status !== 0 && !allowFail) {
    let hint;
    if (/Apps Script API|has not been used|is disabled/i.test(out)) {
      // この設定は Google アカウントごと。ブラウザで別アカウントの設定を変えてしまうことが多いので、
      // clasp でログイン中のアカウントを明示した URL を案内する
      const email = currentAccount();
      const url = 'https://script.google.com/home/usersettings' + (email ? '?authuser=' + encodeURIComponent(email) : '');
      hint = [
        'Apps Script API が' + (email ? ` ${email} で` : '') + '無効になっています。',
        'この設定は Google アカウントごとです。clasp でログインしているアカウントで、次の URL を開いてオンにしてください:',
        '  ' + url,
        '（右上のアイコンが ' + (email || 'clasp のアカウント') + ' になっているか確認してください。オンなのに通らない場合は一度オフ→オンに）',
        'Google Workspace のアカウントで設定画面に項目が無い・変更できない場合は、管理者が Apps Script API を制限している可能性があります。'
      ].join('\n');
    } else if (/no credentials|login|unauthenticated|invalid_grant|invalid_client/i.test(out)) {
      hint = 'clasp にログインしていません。`npx clasp login` を実行してください（CI の場合は CLASPRC_JSON シークレットを確認）。';
    }
    fail('clasp ' + claspArgs[0] + ' に失敗しました', hint);
  }
  return r;
}

function readConfig() {
  const cfg = fs.existsSync(CLASP_JSON) ? JSON.parse(fs.readFileSync(CLASP_JSON, 'utf8')) : {};
  if (process.env.GAS_SCRIPT_ID) cfg.scriptId = process.env.GAS_SCRIPT_ID;
  if (process.env.GAS_DEPLOYMENT_ID) cfg.deploymentId = process.env.GAS_DEPLOYMENT_ID;
  return cfg;
}

function writeConfig(cfg) {
  const out = { scriptId: cfg.scriptId, rootDir: 'src' };
  if (cfg.deploymentId) out.deploymentId = cfg.deploymentId;
  fs.writeFileSync(CLASP_JSON, JSON.stringify(out, null, 2) + '\n');
}

/** CI 等で .clasp.json が無い場合、環境変数から作る */
function ensureClaspJson() {
  const cfg = readConfig();
  if (!cfg.scriptId) {
    fail('スクリプト ID が設定されていません',
      '初回は `npm run setup` を実行してください（既存のプロジェクトを使う場合は `npm run setup -- --script-id <ID>`）。');
  }
  writeConfig(cfg);
  return cfg;
}

function isLoggedIn() {
  if (process.env.CLASPRC_JSON) return true;
  return fs.existsSync(path.join(os.homedir(), '.clasprc.json'));
}

function webAppUrl(deploymentId) {
  return `https://script.google.com/macros/s/${deploymentId}/exec`;
}

function describe() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const git = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  const sha = git.status === 0 ? git.stdout.trim() : 'local';
  const dirty = spawnSync('git', ['status', '--porcelain', 'src'], { cwd: ROOT, encoding: 'utf8' });
  const mark = dirty.status === 0 && dirty.stdout.trim() ? '+dirty' : '';
  const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `v${pkg.version} ${sha}${mark} (${date} UTC)`;
}

function listDeployments() {
  const r = clasp(['list-deployments', '--json'], { capture: true });
  try {
    return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')));
  } catch (e) {
    fail('デプロイ一覧を読み取れませんでした', r.stdout);
  }
}

// ---------------- コマンド ----------------

const LOGIN_TIP = [
  'ブラウザで使いたい Google アカウントを選んで許可してください。',
  c.dim('※ アカウント選択画面が出ずに別のアカウントで進んでしまう場合は、下に表示される URL をコピーし、'),
  c.dim('  シークレットウィンドウ（または目的のアカウントの Chrome プロフィール）で開いてください。'),
  c.dim('  URL の末尾に &prompt=select_account を付けると、アカウント選択画面を必ず表示できます。')
].join('\n');

/** ログイン中のアカウントのメールアドレス（取れなければ null） */
function currentAccount() {
  const r = clasp(['show-authorized-user', '--json'], { capture: true, allowFail: true });
  try {
    return JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).email || null;
  } catch (e) {
    return null;
  }
}

function login() {
  console.log(LOGIN_TIP);
  clasp(['login'], { interactive: true });
  const email = currentAccount();
  console.log(c.green('✓ ログインしました: ' + (email || '(メールアドレス不明)')));
  return email;
}

function setup() {
  step('1/4 clasp のログイン確認');
  if (!isLoggedIn()) {
    login();
  } else {
    const email = currentAccount();
    console.log(c.green('✓ ログイン済み: ' + (email || '(メールアドレス不明)')));
    console.log(c.dim('  別のアカウントを使う場合は Ctrl+C で中断して `npm run switch-account` を実行してください。'));
  }

  step('2/4 GAS プロジェクト');
  const cfg = readConfig();
  const givenId = flag('--script-id');
  if (givenId) {
    cfg.scriptId = givenId;
    console.log(c.green('✓ 既存のプロジェクトを使用: ' + givenId));
  } else if (cfg.scriptId) {
    console.log(c.green('✓ 設定済み: ' + cfg.scriptId));
  } else {
    // create-script はひな形ファイルを pull してくるので、src/ を汚さないよう一時ディレクトリで作る
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rss-widget-clasp-'));
    try {
      clasp(['create-script', '--type', 'standalone', '--title', TITLE, '--rootDir', '.'], { cwd: tmp });
      cfg.scriptId = JSON.parse(fs.readFileSync(path.join(tmp, '.clasp.json'), 'utf8')).scriptId;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(c.green('✓ プロジェクトを作成しました: ' + cfg.scriptId));
  }
  writeConfig(cfg);

  step('3/4 デプロイ');
  const deploymentId = deploy({ quiet: true });

  step('4/4 権限の承認（初回のみ・手動）');
  console.log([
    'ウェブアプリが外部の RSS を取得できるよう、一度だけ権限を承認する必要があります。',
    `  1. ${c.bold(`https://script.google.com/d/${cfg.scriptId}/edit`)} を開く`,
    `  2. 関数のプルダウンで ${c.bold('authorize')} を選んで「実行」`,
    '  3. 「権限を確認」→ アカウントを選択 →（「このアプリは確認されていません」と出たら「詳細」→「移動」）→「許可」',
    '',
    `完了したら ${c.bold(webAppUrl(deploymentId))} を開いてください。`,
    '以降の更新は `npm run deploy` だけで、同じ URL のまま反映されます。'
  ].join('\n'));
}

function deploy({ quiet = false } = {}) {
  const cfg = ensureClaspJson();
  if (!quiet) step('src/ を push');
  clasp(['push', '--force']);

  if (!quiet) step('ウェブアプリのデプロイを更新');
  let deploymentId = flag('--deployment-id') || cfg.deploymentId;
  if (!deploymentId) {
    // 既存のバージョン付きデプロイが 1 つだけならそれを使う（手動で作ったデプロイを引き継ぐ）
    const versioned = listDeployments().filter((d) => d.versionNumber);
    if (versioned.length === 1) {
      deploymentId = versioned[0].deploymentId;
      console.log(c.yellow('既存のデプロイを使用します: ' + deploymentId));
    } else if (versioned.length > 1) {
      console.log(versioned.map((d) => `  ${d.deploymentId}  @${d.versionNumber}  ${d.description || ''}`).join('\n'));
      fail('デプロイが複数あります。どれを更新するか指定してください',
        '`npm run deploy -- --deployment-id <ID>` か、.clasp.json に "deploymentId" を書いてください。');
    }
  }

  const desc = describe();
  if (deploymentId) {
    clasp(['create-deployment', '--deploymentId', deploymentId, '--description', desc]);
  } else {
    const r = clasp(['create-deployment', '--description', desc, '--json'], { capture: true });
    deploymentId = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).deploymentId;
    console.log(c.green('✓ 新しいデプロイを作成しました: ' + deploymentId));
  }
  if (!process.env.GAS_DEPLOYMENT_ID) writeConfig({ ...cfg, deploymentId });

  console.log('\n' + c.green('✓ デプロイ完了 ') + c.dim(desc));
  console.log('  ウェブアプリ: ' + c.bold(webAppUrl(deploymentId)));
  return deploymentId;
}

function status() {
  const cfg = ensureClaspJson();
  console.log('スクリプト ID : ' + cfg.scriptId);
  console.log('デプロイ ID   : ' + (cfg.deploymentId || c.yellow('(未設定)')));
  if (cfg.deploymentId) console.log('ウェブアプリ  : ' + webAppUrl(cfg.deploymentId));
  console.log('エディタ      : https://script.google.com/d/' + cfg.scriptId + '/edit\n');
  clasp(['list-deployments']);
}

function open() {
  const cfg = ensureClaspJson();
  console.log('https://script.google.com/d/' + cfg.scriptId + '/edit');
  clasp(['open-script'], { interactive: true, allowFail: true });
}

function account() {
  if (!isLoggedIn()) {
    console.log(c.yellow('ログインしていません。`npm run setup` か `npm run switch-account` を実行してください。'));
    return;
  }
  console.log('ログイン中: ' + c.bold(currentAccount() || '(メールアドレス不明)'));
}

/**
 * 別のアカウントでログインし直す。
 * GAS プロジェクトはアカウントごとに別物なので、既存の .clasp.json は .clasp.json.bak に退避する
 * （--keep-project を付けると残す。新しいアカウントにも編集権限を共有してある場合など）。
 */
function switchAccount() {
  step('1/3 ログアウト');
  if (isLoggedIn()) {
    const before = currentAccount();
    clasp(['logout']);
    console.log(c.green('✓ ログアウトしました' + (before ? ': ' + before : '')));
  } else {
    console.log('ログインしていません');
  }

  step('2/3 ログイン');
  login();

  step('3/3 プロジェクト設定');
  if (fs.existsSync(CLASP_JSON) && !args.includes('--keep-project')) {
    const bak = CLASP_JSON + '.bak';
    fs.renameSync(CLASP_JSON, bak);
    console.log(c.yellow('前のアカウントのプロジェクト設定を .clasp.json.bak に退避しました。'));
    console.log('続けて ' + c.bold('npm run setup') + ' を実行すると、このアカウントに新しいプロジェクトを作ってデプロイします。');
    console.log(c.dim('（前のアカウントに作られた GAS プロジェクトが不要なら、https://script.google.com/home から削除してください）'));
  } else if (fs.existsSync(CLASP_JSON)) {
    console.log('既存のプロジェクト設定をそのまま使います。`npm run deploy` で確認してください。');
  } else {
    console.log('続けて ' + c.bold('npm run setup') + ' を実行してください。');
  }
}

const commands = { setup, deploy: () => deploy(), status, open, account, 'switch-account': switchAccount };
if (!commands[cmd]) fail('不明なコマンド: ' + cmd, '使えるコマンド: ' + Object.keys(commands).join(', '));
commands[cmd]();
