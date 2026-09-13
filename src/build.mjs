// build.mjs — src/index.template.html → public/index.html
//
// 하는 일 네 가지 (구현 지시서 01(2기) §4-2 · §4-3 · 02(2기) v2.0 §3)
//   ① 폼 A·B·C 주입 — 세 폼은 완전히 같은 마크업이고 cta 값과 버튼 문구만 다르다(02 §3-5).
//      + #kit-guide 본문 주입 — src/kit-guide.html(킷 원문에서 build_kit_zip.py 가 뽑은 조각 · 손으로 고치지 않는다).
//   ② 인라인 <script> 1개 주입 — 외부 스크립트 0.
//   ③ $…$ · $$…$$ 를 KaTeX로 **빌드 시** HTML로 굽는다. 런타임 KaTeX JS 없음.
//   ④ KaTeX CSS·폰트를 public/katex/ 로 self-host 하고, 인라인 스크립트의 sha256을
//      넣은 public/_headers(CSP)를 쓴다 — 'unsafe-inline' 없이 스크립트를 허용하기 위해.
//
// 이 빌드는 네트워크를 타지 않는다. node_modules/katex 만 읽는다.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import katex from 'katex';

const ROOT = path.resolve(import.meta.dirname, '..');
const TPL = path.join(ROOT, 'src', 'index.template.html');
const OUT = path.join(ROOT, 'public', 'index.html');
const KATEX_SRC = path.join(ROOT, 'node_modules', 'katex', 'dist');
const KATEX_DST = path.join(ROOT, 'public', 'katex');

// ── ① 폼 ─────────────────────────────────────────────────────────────────
// 지시서 01 §4-2 의 마크업 그대로. 허니팟 `website` 는 사람에게 보이지 않고 봇만 채운다.
// cta 는 hidden 값으로 싣는다(02 §3-5) — JS 가 죽은 일반 POST 에서도 어느 폼인지가 함께 간다.
const BUTTON = {
  A: '미끼값 프롬프트 받기',   // 선언문 v1.3 §3 CTA · 랜딩 v1.1 §1
  B: '미끼값 프롬프트 받기',
  C: '교사용 킷 받기',         // 랜딩 v1.1 §1 구획 3-1
};
const form = (cta) => `<form class="cta" method="post" action="/api/subscribe" data-cta="${cta}">
      <label class="cta__email">이메일
        <input type="email" name="email" required autocomplete="email" inputmode="email" placeholder="teacher@example.com">
      </label>
      <label class="consent">
        <input type="checkbox" name="consent" required>
        <span>개인정보 수집·이용에 동의합니다 <a href="#privacy">자세히</a></span>
      </label>
      <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp">
      <input type="hidden" name="cta" value="${cta}">
      <button type="submit">${BUTTON[cta]}</button>
      <p class="msg" role="status" aria-live="polite"></p>
    </form>`;

// ── ② 인라인 스크립트 ────────────────────────────────────────────────────
// 이것 하나뿐이다. JS가 죽어도 폼은 일반 POST로 동작한다(함수가 Accept 로 갈라 응답).
const SCRIPT_BODY = `
(function () {
  var FALLBACK = {
    400: '요청을 확인해 주세요.',
    429: '오늘은 더 보낼 수 없습니다. 내일 다시 요청해 주세요.',
    503: '지금은 보낼 수 없습니다. 잠시 후 다시 시도해 주세요.'
  };

  function show(form, text, ok) {
    var msg = form.querySelector('.msg');
    msg.textContent = text;
    msg.className = 'msg' + (ok ? ' msg--ok' : ' msg--err');
    if (!ok) return;
    form.classList.add('cta--sent');
    var again = document.createElement('button');
    again.type = 'button';
    again.className = 'again';
    again.textContent = '다시 받기 →';
    again.addEventListener('click', function () {
      form.classList.remove('cta--sent');
      msg.textContent = '';
      msg.className = 'msg';
      again.remove();
      form.reset();
      form.querySelector('input[name=email]').focus();
    });
    msg.after(again);
  }

  Array.prototype.forEach.call(document.querySelectorAll('form.cta'), function (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var button = form.querySelector('button[type=submit]');
      button.disabled = true;
      var payload = new FormData(form);
      fetch(form.action, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: payload
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          show(form, data.message || FALLBACK[res.status] || '처리에 실패했습니다.', res.ok);
        });
      }).catch(function () {
        show(form, '연결에 실패했습니다. 잠시 후 다시 시도해 주세요.', false);
      }).then(function () {
        button.disabled = false;
      });
    });
  });

  // 메일의 「사용 안내」 링크(#kit-guide)로 들어오면 접힘을 연다 — 앵커가 details 자신이면 브라우저가 열지 않는다.
  function openTarget() {
    var id = location.hash.slice(1);
    var el = id && document.getElementById(id);
    if (el && el.tagName === 'DETAILS') el.open = true;
  }
  openTarget();
  window.addEventListener('hashchange', openTarget);
})();
`;

// ── ③ 수식 ───────────────────────────────────────────────────────────────
// 템플릿 안에서 $ 는 오직 수식 구분자로만 쓴다(styles.css·스크립트에는 $ 가 없다).
// HTML 실체참조(&gt; 등)는 KaTeX에 넘기기 전에 풀어 준다.
const unescapeHtml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

let mathCount = 0;
function renderMath(html) {
  // 주석은 수식 처리에서 빼 둔다 — 주석 안의 `$…$` 설명문까지 구워 버리는 일을 막는다.
  const comments = [];
  html = html.replace(/<!--[\s\S]*?-->/g, (c) => {
    comments.push(c);
    return `@@COMMENT_${comments.length - 1}@@`;
  });

  // $$…$$ 먼저(디스플레이), 그다음 $…$(인라인)
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    mathCount++;
    return katex.renderToString(unescapeHtml(tex), { displayMode: true, throwOnError: true, strict: 'error' });
  });
  html = html.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
    mathCount++;
    return katex.renderToString(unescapeHtml(tex), { displayMode: false, throwOnError: true, strict: 'error' });
  });

  return html.replace(/@@COMMENT_(\d+)@@/g, (_, i) => comments[Number(i)]);
}

// ── ④ KaTeX 자산 복사 ────────────────────────────────────────────────────
function copyKatex() {
  fs.rmSync(KATEX_DST, { recursive: true, force: true });
  fs.mkdirSync(path.join(KATEX_DST, 'fonts'), { recursive: true });
  fs.copyFileSync(path.join(KATEX_SRC, 'katex.min.css'), path.join(KATEX_DST, 'katex.min.css'));
  let n = 0;
  for (const f of fs.readdirSync(path.join(KATEX_SRC, 'fonts'))) {
    if (!f.endsWith('.woff2')) continue;   // woff/ttf 는 싣지 않는다 — 대상 브라우저 전부 woff2 지원
    fs.copyFileSync(path.join(KATEX_SRC, 'fonts', f), path.join(KATEX_DST, 'fonts', f));
    n++;
  }
  // katex.min.css 는 woff2/woff/ttf 를 순서대로 참조한다. woff/ttf 만 지우면 404가 뜨므로
  // src 목록에서 woff2 한 줄만 남긴다.
  const cssPath = path.join(KATEX_DST, 'katex.min.css');
  let css = fs.readFileSync(cssPath, 'utf8');
  css = css.replace(/src:([^;}]*)/g, (whole, list) => {
    const woff2 = list.split(',').find((s) => s.includes('woff2'));
    return woff2 ? `src:${woff2.trim()}` : whole;
  });
  fs.writeFileSync(cssPath, css);
  return n;
}

// ── 조립 ─────────────────────────────────────────────────────────────────
let html = fs.readFileSync(TPL, 'utf8');

for (const slot of ['<!--FORM:A-->', '<!--FORM:B-->', '<!--FORM:C-->', '<!--KIT_GUIDE-->', '<!--SCRIPT-->']) {
  if (html.split(slot).length !== 2) throw new Error(`템플릿에 ${slot} 자리가 정확히 1개가 아니다.`);
}
const KIT_GUIDE = fs.readFileSync(path.join(ROOT, 'src', 'kit-guide.html'), 'utf8');
if (KIT_GUIDE.includes('$')) throw new Error('kit-guide.html 에 $ 가 있다 — 수식 구분자와 충돌한다.');
html = html
  .replace('<!--FORM:A-->', form('A'))
  .replace('<!--FORM:B-->', form('B'))
  .replace('<!--FORM:C-->', form('C'))
  .replace('<!--KIT_GUIDE-->', KIT_GUIDE.trim());
html = renderMath(html);

const scriptHash = crypto.createHash('sha256').update(SCRIPT_BODY, 'utf8').digest('base64');
html = html.replace('<!--SCRIPT-->', `<script>${SCRIPT_BODY}</script>`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

const katexFonts = copyKatex();

// CSP — 외부 요청 0(P-8 · 랜딩 v1.0 §1-1). 스크립트는 해시로만 허용한다.
// style-src 에 'unsafe-inline' 이 필요한 이유: KaTeX가 구운 <span> 이 style 속성을 쓴다.
const headers = `/*
  Content-Security-Policy: default-src 'self'; script-src 'sha256-${scriptHash}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=(), interest-cohort=()

/dl/*
  Cache-Control: public, max-age=3600
  Content-Disposition: attachment

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/katex/fonts/*
  Cache-Control: public, max-age=31536000, immutable
`;
fs.writeFileSync(path.join(ROOT, 'public', '_headers'), headers);

const bytes = Buffer.byteLength(html, 'utf8');
console.log('── build ────────────────────────────────────────────');
console.log(`  public/index.html   ${bytes} bytes`);
console.log(`  수식(KaTeX 정적)     ${mathCount}건`);
console.log(`  KaTeX woff2         ${katexFonts}개 → public/katex/fonts/`);
console.log(`  인라인 script sha256 ${scriptHash}`);
console.log('  public/_headers     CSP 기록');
