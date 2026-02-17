/**
 * 노미네 왕국 — Book Preview Engine
 * Config-Driven 동화책 미리보기
 */

// ========== Korean Language Helpers ==========

/** 한글 유니코드 범위: 0xAC00 ~ 0xD7A3 */
function hasBatchim(char) {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return false;
  return (code - 0xAC00) % 28 !== 0;
}

/** 이름의 마지막 글자에 받침이 있는지 */
function nameHasBatchim(name) {
  if (!name || name.length === 0) return false;
  return hasBatchim(name[name.length - 1]);
}

/**
 * 이름 → 캐주얼 호칭 (받침 있으면 +이, 없으면 그대로)
 * 도현 → 도현이, 지수 → 지수
 */
function casualName(firstName) {
  return nameHasBatchim(firstName) ? firstName + '이' : firstName;
}

/**
 * 한글 자모 분해 (초성, 중성, 종성)
 * "도현" → "ㄷ, ㅗ, ㅎ, ㅕ, ㄴ"
 */
function decomposeKorean(str) {
  const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

  const letters = [];
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const offset = code - 0xAC00;
      const cho = Math.floor(offset / (21 * 28));
      const jung = Math.floor((offset % (21 * 28)) / 28);
      const jong = offset % 28;
      letters.push(CHO[cho], JUNG[jung]);
      if (jong !== 0) letters.push(JONG[jong]);
    } else {
      letters.push(ch);
    }
  }
  return letters.join(', ');
}

// ========== Variable Substitution ==========

/**
 * 텍스트의 {변수} 치환
 * {name} → 캐주얼 호칭 (도현이/지수)
 * {firstName} → 원래 이름 (도현/지수)
 * {parentNames} → 부모 호칭 (엄마 아빠)
 * {nameLetters} → 자모 분해 (ㄷ, ㅗ, ㅎ, ㅕ, ㄴ)
 */
function substituteVars(text, vars) {
  if (!text) return '';
  return text
    .replace(/\{name\}/g, vars.name)
    .replace(/\{firstName\}/g, vars.firstName)
    .replace(/\{parentNames\}/g, vars.parentNames)
    .replace(/\{nameLetters\}/g, vars.nameLetters);
}

// ========== App State ==========
let config = null;
let currentVersion = 'A';
let currentPageIndex = 0;
let variables = {};

// ========== DOM ==========
const els = {};

function cacheDom() {
  els.firstNameInput = document.getElementById('input-firstName');
  els.parentNamesInput = document.getElementById('input-parentNames');
  els.versionBtns = document.querySelectorAll('.version-btn');
  els.pageViewer = document.getElementById('page-viewer');
  els.pageTitle = document.getElementById('page-title');
  els.pageCounter = document.getElementById('page-counter');
  els.pageCounterBottom = document.getElementById('page-counter-bottom');
  els.prevBtn = document.getElementById('btn-prev');
  els.nextBtn = document.getElementById('btn-next');
  els.thumbnailStrip = document.getElementById('thumbnail-strip');
  els.versionLabel = document.getElementById('version-label');
}

// ========== Config Loading ==========

async function loadConfig() {
  try {
    const resp = await fetch('configs/name.config.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    config = await resp.json();
  } catch (e) {
    // file:// fallback: try loading via inline config if available
    if (window.__BOOK_CONFIG) {
      config = window.__BOOK_CONFIG;
    } else {
      console.error('Config load failed:', e);
      els.pageViewer.innerHTML = '<div style="padding:40px;color:#f66;text-align:center;">Config 로드 실패. HTTP 서버를 사용하세요.<br><code>python3 -m http.server 8765</code></div>';
      return;
    }
  }

  // Set defaults
  els.firstNameInput.value = config.defaults.firstName;
  els.parentNamesInput.value = config.defaults.parentNames;

  updateVariables();
  renderPage();
  renderThumbnails();
}

// ========== Variable Update ==========

function updateVariables() {
  const firstName = els.firstNameInput.value.trim() || config.defaults.firstName;
  const parentNames = els.parentNamesInput.value.trim() || config.defaults.parentNames;

  variables = {
    firstName,
    name: casualName(firstName),
    parentNames,
    nameLetters: decomposeKorean(firstName)
  };
}

// ========== Page Rendering ==========

function getPages() {
  return config.versions[currentVersion].pages;
}

function renderPage() {
  const pages = getPages();
  if (currentPageIndex >= pages.length) currentPageIndex = pages.length - 1;
  if (currentPageIndex < 0) currentPageIndex = 0;

  const page = pages[currentPageIndex];
  const viewer = els.pageViewer;

  // Build illustration or gradient background
  let bgHtml = '';
  if (page.illustration && config.illustrations[page.illustration]) {
    const imgPath = config.illustrations[page.illustration];
    bgHtml = `<img class="page-bg-img" src="${imgPath}" alt="${page.title}" />`;
  } else if (page.bgGradient) {
    bgHtml = `<div class="page-bg-gradient" style="background:${page.bgGradient}"></div>`;
  }

  // Text with variable substitution
  const text = substituteVars(page.text, variables);
  const textColor = page.textColor || 'white';
  const posClass = `text-pos-${page.textPosition || 'center'}`;

  // Scene badge
  const sceneBadge = `<span class="scene-badge">${page.scene}. ${page.title}</span>`;

  viewer.innerHTML = `
    ${bgHtml}
    <div class="page-text-overlay ${posClass}" style="color:${textColor}">
      ${sceneBadge}
      <div class="page-story-text">${text.replace(/\n/g, '<br>')}</div>
    </div>
  `;

  // Update page info
  els.pageTitle.textContent = `${page.scene}. ${page.title}`;
  els.pageCounter.textContent = `${currentPageIndex + 1} / ${pages.length}`;
  if (els.pageCounterBottom) {
    els.pageCounterBottom.textContent = `${currentPageIndex + 1} / ${pages.length}`;
  }

  // Navigation buttons
  els.prevBtn.disabled = currentPageIndex === 0;
  els.nextBtn.disabled = currentPageIndex === pages.length - 1;

  // Highlight active thumbnail
  document.querySelectorAll('.thumb').forEach((t, i) => {
    t.classList.toggle('active', i === currentPageIndex);
  });

  // Scroll active thumbnail into view
  const activeThumb = document.querySelector('.thumb.active');
  if (activeThumb) {
    activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

function renderThumbnails() {
  const pages = getPages();
  const strip = els.thumbnailStrip;
  strip.innerHTML = '';

  pages.forEach((page, i) => {
    const thumb = document.createElement('div');
    thumb.className = `thumb ${i === currentPageIndex ? 'active' : ''}`;

    if (page.illustration && config.illustrations[page.illustration]) {
      const imgPath = config.illustrations[page.illustration];
      thumb.innerHTML = `<img src="${imgPath}" alt="${page.title}" /><span class="thumb-label">${page.scene}</span>`;
    } else {
      thumb.innerHTML = `<div class="thumb-gradient" style="background:${page.bgGradient || '#333'}"></div><span class="thumb-label">${page.scene}</span>`;
    }

    thumb.addEventListener('click', () => {
      currentPageIndex = i;
      renderPage();
    });
    strip.appendChild(thumb);
  });
}

// ========== Event Handlers ==========

function setupEvents() {
  // Input changes → real-time update
  els.firstNameInput.addEventListener('input', () => {
    updateVariables();
    renderPage();
  });

  els.parentNamesInput.addEventListener('input', () => {
    updateVariables();
    renderPage();
  });

  // Version switch
  els.versionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      els.versionBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentVersion = btn.dataset.version;
      currentPageIndex = 0;
      els.versionLabel.textContent = config.versions[currentVersion].label;
      renderPage();
      renderThumbnails();
    });
  });

  // Navigation
  els.prevBtn.addEventListener('click', () => {
    if (currentPageIndex > 0) {
      currentPageIndex--;
      renderPage();
    }
  });

  els.nextBtn.addEventListener('click', () => {
    const pages = getPages();
    if (currentPageIndex < pages.length - 1) {
      currentPageIndex++;
      renderPage();
    }
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') {
      if (currentPageIndex > 0) { currentPageIndex--; renderPage(); }
    } else if (e.key === 'ArrowRight') {
      const pages = getPages();
      if (currentPageIndex < pages.length - 1) { currentPageIndex++; renderPage(); }
    }
  });
}

// ========== Init ==========

document.addEventListener('DOMContentLoaded', () => {
  cacheDom();
  setupEvents();
  loadConfig();
});
