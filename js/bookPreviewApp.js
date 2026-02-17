/**
 * 노미네 왕국 — Book Preview Engine
 * Config-Driven 동화책 미리보기
 */

// ========== Korean Language Helpers ==========

function hasBatchim(char) {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return false;
  return (code - 0xAC00) % 28 !== 0;
}

function nameHasBatchim(name) {
  if (!name || name.length === 0) return false;
  return hasBatchim(name[name.length - 1]);
}

function casualName(firstName) {
  return nameHasBatchim(firstName) ? firstName + '이' : firstName;
}

function decomposeKorean(str) {
  const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const letters = [];
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const offset = code - 0xAC00;
      letters.push(CHO[Math.floor(offset / (21 * 28))], JUNG[Math.floor((offset % (21 * 28)) / 28)]);
      if (offset % 28 !== 0) letters.push(JONG[offset % 28]);
    } else {
      letters.push(ch);
    }
  }
  return letters.join(', ');
}

// ========== Variable Substitution ==========

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
  els.mFirstNameInput = document.getElementById('m-input-firstName');
  els.mParentNamesInput = document.getElementById('m-input-parentNames');
  els.versionBtns = document.querySelectorAll('.version-btn');
  els.pageViewer = document.getElementById('page-viewer');
  els.pageTitle = document.getElementById('page-title');
  els.pageCounter = document.getElementById('page-counter');
  els.pageCounterBottom = document.getElementById('page-counter-bottom');
  els.mPageTitle = document.getElementById('m-page-title');
  els.mPageCounter = document.getElementById('m-page-counter');
  els.prevBtn = document.getElementById('btn-prev');
  els.nextBtn = document.getElementById('btn-next');
  els.mPrevBtn = document.getElementById('m-btn-prev');
  els.mNextBtn = document.getElementById('m-btn-next');
  els.thumbnailStrip = document.getElementById('thumbnail-strip');
  els.versionLabel = document.getElementById('version-label');
  els.settingsBtn = document.getElementById('btn-settings');
  els.settingsOverlay = document.getElementById('settings-overlay');
  els.settingsBackdrop = document.getElementById('settings-backdrop');
}

// ========== Config Loading ==========

async function loadConfig() {
  try {
    const resp = await fetch('configs/name.config.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    config = await resp.json();
  } catch (e) {
    if (window.__BOOK_CONFIG) {
      config = window.__BOOK_CONFIG;
    } else {
      console.error('Config load failed:', e);
      els.pageViewer.innerHTML = '<div style="padding:40px;color:#f66;text-align:center;">Config 로드 실패.<br><code>python3 -m http.server 8765</code></div>';
      return;
    }
  }

  const fn = config.defaults.firstName;
  const pn = config.defaults.parentNames;
  els.firstNameInput.value = fn;
  els.parentNamesInput.value = pn;
  els.mFirstNameInput.value = fn;
  els.mParentNamesInput.value = pn;

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

function syncInputs(source) {
  if (source === 'desktop') {
    els.mFirstNameInput.value = els.firstNameInput.value;
    els.mParentNamesInput.value = els.parentNamesInput.value;
  } else {
    els.firstNameInput.value = els.mFirstNameInput.value;
    els.parentNamesInput.value = els.mParentNamesInput.value;
  }
}

// ========== Navigation ==========

function goPage(delta) {
  const pages = getPages();
  const next = currentPageIndex + delta;
  if (next >= 0 && next < pages.length) {
    currentPageIndex = next;
    renderPage();
  }
}

// ========== Page Rendering ==========

function getPages() {
  return config.versions[currentVersion].pages;
}

function centerScrollArea() {
  const scrollArea = els.pageViewer.querySelector('.page-scroll-area');
  if (!scrollArea) return;
  const maxScroll = scrollArea.scrollWidth - scrollArea.clientWidth;
  scrollArea.scrollLeft = maxScroll / 2;
}

function renderPage() {
  const pages = getPages();
  if (currentPageIndex >= pages.length) currentPageIndex = pages.length - 1;
  if (currentPageIndex < 0) currentPageIndex = 0;

  const page = pages[currentPageIndex];
  const viewer = els.pageViewer;

  // Build illustration or gradient background inside scroll area
  let bgHtml = '';
  let hasImage = false;
  if (page.illustration && config.illustrations[page.illustration]) {
    const imgPath = config.illustrations[page.illustration];
    bgHtml = `<img class="page-bg-img" src="${imgPath}" alt="${page.title}" />`;
    hasImage = true;
  } else if (page.bgGradient) {
    bgHtml = `<div class="page-bg-gradient" style="background:${page.bgGradient}"></div>`;
  }

  const text = substituteVars(page.text, variables);
  const textColor = page.textColor || 'white';
  const posClass = `text-pos-${page.textPosition || 'center'}`;

  const canPrev = currentPageIndex > 0;
  const canNext = currentPageIndex < pages.length - 1;

  // Text overlay goes INSIDE scroll content so it moves with the image
  const textOverlay = `
    <div class="page-text-overlay ${posClass}" style="color:${textColor}">
      <div class="page-story-text">${text.replace(/\n/g, '<br>')}</div>
    </div>`;

  viewer.innerHTML = `
    <div class="page-scroll-area">
      <div class="page-scroll-content page-fade-in">
        ${bgHtml}
        ${textOverlay}
      </div>
    </div>
    <div class="edge-hint edge-hint-left" id="edge-left">
      <span class="edge-hint-icon">${canPrev ? '◀' : ''}</span>
    </div>
    <div class="edge-hint edge-hint-right" id="edge-right">
      <span class="edge-hint-icon">${canNext ? '▶' : ''}</span>
    </div>
  `;

  // Center scroll on image load
  const img = viewer.querySelector('.page-bg-img');
  if (img) {
    const onLoad = () => {
      centerScrollArea();
      setupScrollEdgeDetection();
    };
    img.addEventListener('load', onLoad);
    if (img.complete) onLoad();
  } else {
    // Gradient page — no scroll needed, but still setup edge detection
    setupScrollEdgeDetection();
  }

  // Update info displays
  const label = `${page.scene}. ${page.title}`;
  const counter = `${currentPageIndex + 1} / ${pages.length}`;
  els.pageTitle.textContent = label;
  els.pageCounter.textContent = counter;
  if (els.pageCounterBottom) els.pageCounterBottom.textContent = counter;
  if (els.mPageTitle) els.mPageTitle.textContent = label;
  if (els.mPageCounter) els.mPageCounter.textContent = counter;

  els.prevBtn.disabled = !canPrev;
  els.nextBtn.disabled = !canNext;
  if (els.mPrevBtn) els.mPrevBtn.disabled = !canPrev;
  if (els.mNextBtn) els.mNextBtn.disabled = !canNext;

  document.querySelectorAll('.thumb').forEach((t, i) => {
    t.classList.toggle('active', i === currentPageIndex);
  });
  const activeThumb = document.querySelector('.thumb.active');
  if (activeThumb) {
    activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

// ========== Scroll Edge Detection → Page Transition ==========

function setupScrollEdgeDetection() {
  const scrollArea = els.pageViewer.querySelector('.page-scroll-area');
  if (!scrollArea) return;

  const edgeLeft = document.getElementById('edge-left');
  const edgeRight = document.getElementById('edge-right');
  const OVERSCROLL_THRESHOLD = 60;
  let touchStartX = 0;
  let touchStartScroll = 0;
  let atEdge = null; // 'left' | 'right' | null
  let overscrollDistance = 0;
  let navigated = false;

  scrollArea.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartScroll = scrollArea.scrollLeft;
    atEdge = null;
    overscrollDistance = 0;
    navigated = false;

    const maxScroll = scrollArea.scrollWidth - scrollArea.clientWidth;
    if (scrollArea.scrollLeft <= 1) atEdge = 'left';
    else if (scrollArea.scrollLeft >= maxScroll - 1) atEdge = 'right';
  }, { passive: true });

  scrollArea.addEventListener('touchmove', (e) => {
    if (navigated) return;

    const maxScroll = scrollArea.scrollWidth - scrollArea.clientWidth;
    const dx = e.touches[0].clientX - touchStartX;

    // Check if we're at the edge and swiping further
    if (atEdge === 'left' && scrollArea.scrollLeft <= 1 && dx > 0) {
      overscrollDistance = dx;
      if (edgeLeft) edgeLeft.classList.toggle('visible', overscrollDistance > 20 && currentPageIndex > 0);
      if (overscrollDistance > OVERSCROLL_THRESHOLD && currentPageIndex > 0) {
        navigated = true;
        if (edgeLeft) edgeLeft.classList.remove('visible');
        goPage(-1);
      }
    } else if (atEdge === 'right' && scrollArea.scrollLeft >= maxScroll - 1 && dx < 0) {
      overscrollDistance = Math.abs(dx);
      const pages = getPages();
      if (edgeRight) edgeRight.classList.toggle('visible', overscrollDistance > 20 && currentPageIndex < pages.length - 1);
      if (overscrollDistance > OVERSCROLL_THRESHOLD && currentPageIndex < pages.length - 1) {
        navigated = true;
        if (edgeRight) edgeRight.classList.remove('visible');
        goPage(1);
      }
    } else {
      // Not at edge anymore (user scrolled away)
      atEdge = null;
      if (edgeLeft) edgeLeft.classList.remove('visible');
      if (edgeRight) edgeRight.classList.remove('visible');
    }
  }, { passive: true });

  scrollArea.addEventListener('touchend', () => {
    if (edgeLeft) edgeLeft.classList.remove('visible');
    if (edgeRight) edgeRight.classList.remove('visible');

    // Also detect edge-swipe for pages without scrollable content (gradients)
    if (!navigated && scrollArea.scrollWidth <= scrollArea.clientWidth) {
      const dx = overscrollDistance;
      // We need to use the raw touch delta for non-scrollable pages
    }
    overscrollDistance = 0;
    atEdge = null;
  }, { passive: true });
}

// ========== Thumbnails ==========

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
  els.firstNameInput.addEventListener('input', () => { syncInputs('desktop'); updateVariables(); renderPage(); });
  els.parentNamesInput.addEventListener('input', () => { syncInputs('desktop'); updateVariables(); renderPage(); });
  els.mFirstNameInput.addEventListener('input', () => { syncInputs('mobile'); updateVariables(); renderPage(); });
  els.mParentNamesInput.addEventListener('input', () => { syncInputs('mobile'); updateVariables(); renderPage(); });

  els.versionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      els.versionBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`.version-btn[data-version="${btn.dataset.version}"]`)
        .forEach(b => b.classList.add('active'));
      currentVersion = btn.dataset.version;
      currentPageIndex = 0;
      if (els.versionLabel) els.versionLabel.textContent = config.versions[currentVersion].label;
      renderPage();
      renderThumbnails();
    });
  });

  els.prevBtn.addEventListener('click', () => goPage(-1));
  els.nextBtn.addEventListener('click', () => goPage(1));
  if (els.mPrevBtn) els.mPrevBtn.addEventListener('click', () => goPage(-1));
  if (els.mNextBtn) els.mNextBtn.addEventListener('click', () => goPage(1));

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') goPage(-1);
    else if (e.key === 'ArrowRight') goPage(1);
  });

  if (els.settingsBtn) {
    els.settingsBtn.addEventListener('click', () => els.settingsOverlay.classList.add('open'));
  }
  if (els.settingsBackdrop) {
    els.settingsBackdrop.addEventListener('click', () => els.settingsOverlay.classList.remove('open'));
  }

  // Swipe for gradient pages (no scroll content) on the viewer
  setupViewerSwipe();
}

/** Fallback swipe for pages with no scrollable image (gradient-only) */
function setupViewerSwipe() {
  const viewer = els.pageViewer;
  let startX = 0;
  let startY = 0;

  viewer.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  viewer.addEventListener('touchend', (e) => {
    const scrollArea = viewer.querySelector('.page-scroll-area');
    // Only use fallback swipe if there's no scrollable overflow
    if (scrollArea && scrollArea.scrollWidth > scrollArea.clientWidth + 2) return;

    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) goPage(1);
      else goPage(-1);
    }
  }, { passive: true });
}

// ========== Init ==========

document.addEventListener('DOMContentLoaded', () => {
  cacheDom();
  setupEvents();
  loadConfig();
});
