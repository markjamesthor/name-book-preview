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
  // Desktop inputs
  els.firstNameInput = document.getElementById('input-firstName');
  els.parentNamesInput = document.getElementById('input-parentNames');
  // Mobile inputs
  els.mFirstNameInput = document.getElementById('m-input-firstName');
  els.mParentNamesInput = document.getElementById('m-input-parentNames');
  // Version buttons (both desktop + mobile)
  els.versionBtns = document.querySelectorAll('.version-btn');
  // Viewer
  els.pageViewer = document.getElementById('page-viewer');
  // Desktop info
  els.pageTitle = document.getElementById('page-title');
  els.pageCounter = document.getElementById('page-counter');
  els.pageCounterBottom = document.getElementById('page-counter-bottom');
  // Mobile info
  els.mPageTitle = document.getElementById('m-page-title');
  els.mPageCounter = document.getElementById('m-page-counter');
  // Desktop nav
  els.prevBtn = document.getElementById('btn-prev');
  els.nextBtn = document.getElementById('btn-next');
  // Mobile nav
  els.mPrevBtn = document.getElementById('m-btn-prev');
  els.mNextBtn = document.getElementById('m-btn-next');
  // Touch zones
  els.touchPrev = document.getElementById('touch-prev');
  els.touchNext = document.getElementById('touch-next');
  // Thumbnails
  els.thumbnailStrip = document.getElementById('thumbnail-strip');
  els.versionLabel = document.getElementById('version-label');
  // Settings bottom sheet
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

  // Set defaults on all inputs
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

/** Sync desktop ↔ mobile inputs */
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

function renderPage() {
  const pages = getPages();
  if (currentPageIndex >= pages.length) currentPageIndex = pages.length - 1;
  if (currentPageIndex < 0) currentPageIndex = 0;

  const page = pages[currentPageIndex];
  const viewer = els.pageViewer;

  let bgHtml = '';
  if (page.illustration && config.illustrations[page.illustration]) {
    const imgPath = config.illustrations[page.illustration];
    bgHtml = `<img class="page-bg-img" src="${imgPath}" alt="${page.title}" />`;
  } else if (page.bgGradient) {
    bgHtml = `<div class="page-bg-gradient" style="background:${page.bgGradient}"></div>`;
  }

  const text = substituteVars(page.text, variables);
  const textColor = page.textColor || 'white';
  const posClass = `text-pos-${page.textPosition || 'center'}`;
  const sceneBadge = `<span class="scene-badge">${page.scene}. ${page.title}</span>`;

  viewer.innerHTML = `
    ${bgHtml}
    <div class="page-text-overlay ${posClass}" style="color:${textColor}">
      ${sceneBadge}
      <div class="page-story-text">${text.replace(/\n/g, '<br>')}</div>
    </div>
    <div class="touch-zone touch-zone-left" id="touch-prev"></div>
    <div class="touch-zone touch-zone-right" id="touch-next"></div>
  `;

  // Re-bind touch zones (since innerHTML replaced them)
  document.getElementById('touch-prev')?.addEventListener('click', () => goPage(-1));
  document.getElementById('touch-next')?.addEventListener('click', () => goPage(1));

  // Desktop info
  const label = `${page.scene}. ${page.title}`;
  const counter = `${currentPageIndex + 1} / ${pages.length}`;
  els.pageTitle.textContent = label;
  els.pageCounter.textContent = counter;
  if (els.pageCounterBottom) els.pageCounterBottom.textContent = counter;

  // Mobile info
  if (els.mPageTitle) els.mPageTitle.textContent = label;
  if (els.mPageCounter) els.mPageCounter.textContent = counter;

  // Desktop nav buttons
  els.prevBtn.disabled = currentPageIndex === 0;
  els.nextBtn.disabled = currentPageIndex === pages.length - 1;

  // Mobile nav buttons
  if (els.mPrevBtn) els.mPrevBtn.disabled = currentPageIndex === 0;
  if (els.mNextBtn) els.mNextBtn.disabled = currentPageIndex === pages.length - 1;

  // Highlight active thumbnail
  document.querySelectorAll('.thumb').forEach((t, i) => {
    t.classList.toggle('active', i === currentPageIndex);
  });
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
  // Desktop input changes
  els.firstNameInput.addEventListener('input', () => {
    syncInputs('desktop');
    updateVariables();
    renderPage();
  });
  els.parentNamesInput.addEventListener('input', () => {
    syncInputs('desktop');
    updateVariables();
    renderPage();
  });

  // Mobile input changes
  els.mFirstNameInput.addEventListener('input', () => {
    syncInputs('mobile');
    updateVariables();
    renderPage();
  });
  els.mParentNamesInput.addEventListener('input', () => {
    syncInputs('mobile');
    updateVariables();
    renderPage();
  });

  // Version switch (all buttons, desktop + mobile)
  els.versionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      els.versionBtns.forEach(b => b.classList.remove('active'));
      // Activate both desktop and mobile buttons for this version
      document.querySelectorAll(`.version-btn[data-version="${btn.dataset.version}"]`)
        .forEach(b => b.classList.add('active'));
      currentVersion = btn.dataset.version;
      currentPageIndex = 0;
      if (els.versionLabel) {
        els.versionLabel.textContent = config.versions[currentVersion].label;
      }
      renderPage();
      renderThumbnails();
    });
  });

  // Desktop nav
  els.prevBtn.addEventListener('click', () => goPage(-1));
  els.nextBtn.addEventListener('click', () => goPage(1));

  // Mobile nav
  if (els.mPrevBtn) els.mPrevBtn.addEventListener('click', () => goPage(-1));
  if (els.mNextBtn) els.mNextBtn.addEventListener('click', () => goPage(1));

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') goPage(-1);
    else if (e.key === 'ArrowRight') goPage(1);
  });

  // Settings bottom sheet
  if (els.settingsBtn) {
    els.settingsBtn.addEventListener('click', () => {
      els.settingsOverlay.classList.add('open');
    });
  }
  if (els.settingsBackdrop) {
    els.settingsBackdrop.addEventListener('click', () => {
      els.settingsOverlay.classList.remove('open');
    });
  }

  // Swipe gestures on page viewer
  setupSwipe();
}

// ========== Swipe Gesture ==========

function setupSwipe() {
  const viewer = els.pageViewer;
  let startX = 0;
  let startY = 0;
  let tracking = false;

  viewer.addEventListener('touchstart', (e) => {
    // Don't interfere with touch zones or scrolling
    if (e.target.closest('.touch-zone')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  viewer.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;

    // Only horizontal swipes (dx > dy, and threshold > 40px)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) goPage(1);  // swipe left → next
      else goPage(-1);         // swipe right → prev
    }
  }, { passive: true });
}

// ========== Init ==========

document.addEventListener('DOMContentLoaded', () => {
  cacheDom();
  setupEvents();
  loadConfig();
});
