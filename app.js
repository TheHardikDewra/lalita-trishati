/* ========================================
   Sri Lalita Trishati - App Logic
   ======================================== */

(function () {
  'use strict';

  // ---- State ----
  const STATE = {
    learnedNames: new Set(),
    currentView: 'home',
    currentVerse: 1,
    practiceMode: 's2m',
    practiceScope: 'all',
    practiceQueue: [],
    practiceIndex: 0,
    practiceFlipped: false,
    scoreGot: 0,
    scoreReview: 0,
    nameSearchQuery: '',
    nameRangeFilter: 'all',
    nameStatusFilter: 'all',
    expandedCard: null,
    renderedNameCards: [],
    renderBatchSize: 60,
    renderOffset: 0,
    isRendering: false,
    chantVerse: 1,
    chantAuto: false,
    chantSpeed: 8,
    chantShowTranslit: true,
    chantShowMeaning: false,
    chantFullscreen: false,
    chantTimer: null,
  };

  // ---- Data helpers ----
  const DATA = TRISHATI_DATA;
  const TOTAL_NAMES = DATA.meta.totalNames;
  const TOTAL_VERSES = DATA.meta.totalMainVerses;

  const nameMap = new Map();
  DATA.names.forEach(n => nameMap.set(n.number, n));

  const verseMap = new Map();
  DATA.verses.forEach(v => verseMap.set(v.number, v));

  function getNamesByVerse(verseNum) {
    const verse = verseMap.get(verseNum);
    if (!verse) return [];
    return verse.names.map(num => nameMap.get(num)).filter(Boolean);
  }

  function getNamesBySyllable(sylIdx) {
    return DATA.names.filter(n => n.syllable === sylIdx);
  }

  function getNamesByKuta(kutaIdx) {
    return DATA.names.filter(n => n.kuta === kutaIdx);
  }

  // ---- localStorage ----
  const STORAGE_KEY = 'lt_learned';

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) STATE.learnedNames = new Set(arr);
      }
    } catch (e) { /* ignore */ }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...STATE.learnedNames]));
    } catch (e) { /* ignore */ }
  }

  function toggleLearned(num) {
    if (STATE.learnedNames.has(num)) STATE.learnedNames.delete(num);
    else STATE.learnedNames.add(num);
    saveProgress();
  }

  function markLearned(num) {
    STATE.learnedNames.add(num);
    saveProgress();
  }

  function isLearned(num) {
    return STATE.learnedNames.has(num);
  }

  // ---- SRS (SM-2) ----
  const SRS_KEY = 'lt_srs';

  function loadSRS() {
    try {
      const raw = localStorage.getItem(SRS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveSRS(srsData) {
    try { localStorage.setItem(SRS_KEY, JSON.stringify(srsData)); }
    catch (e) { /* ignore */ }
  }

  function getSRSEntry(srsData, num) {
    return srsData[num] || { interval: 0, easeFactor: 2.5, nextReview: null, repetitions: 0 };
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function recordSRS(nameNumber, quality) {
    const srsData = loadSRS();
    const entry = getSRSEntry(srsData, nameNumber);

    if (quality >= 3) {
      if (entry.repetitions === 0) entry.interval = 1;
      else if (entry.repetitions === 1) entry.interval = 3;
      else entry.interval = Math.round(entry.interval * entry.easeFactor);
      entry.repetitions++;
    } else {
      entry.interval = 1;
      entry.repetitions = 0;
    }

    entry.easeFactor += (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (entry.easeFactor < 1.3) entry.easeFactor = 1.3;

    const next = new Date();
    next.setDate(next.getDate() + entry.interval);
    entry.nextReview = next.toISOString().slice(0, 10);

    srsData[nameNumber] = entry;
    saveSRS(srsData);
  }

  function countDueNames() {
    const srsData = loadSRS();
    const today = todayStr();
    let count = 0;
    DATA.names.forEach(n => {
      const entry = srsData[n.number];
      if (!entry || entry.nextReview <= today) count++;
    });
    return count;
  }

  // ---- Notes ----
  const NOTES_KEY = 'lt_notes';

  function loadNotes() {
    try {
      const raw = localStorage.getItem(NOTES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveNotes(notes) {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); }
    catch (e) { /* ignore */ }
  }

  function getNote(num) {
    const notes = loadNotes();
    return notes[num] || '';
  }

  function setNote(num, text) {
    const notes = loadNotes();
    if (text.trim()) notes[num] = text;
    else delete notes[num];
    saveNotes(notes);
  }

  // ---- Font Size ----
  const FONTSIZE_KEY = 'lt_fontsize';
  const FONTSIZE_MAP = { small: '14px', normal: '16px', large: '18px' };

  function loadFontSize() {
    const val = localStorage.getItem(FONTSIZE_KEY) || 'normal';
    applyFontSize(val);
  }

  function applyFontSize(size) {
    if (!FONTSIZE_MAP[size]) size = 'normal';
    document.documentElement.style.fontSize = FONTSIZE_MAP[size];
    localStorage.setItem(FONTSIZE_KEY, size);
  }

  function getCurrentFontSize() {
    return localStorage.getItem(FONTSIZE_KEY) || 'normal';
  }

  function cycleFontSize(direction) {
    const sizes = ['small', 'normal', 'large'];
    const current = getCurrentFontSize();
    let idx = sizes.indexOf(current) + direction;
    if (idx < 0) idx = 0;
    if (idx > sizes.length - 1) idx = sizes.length - 1;
    applyFontSize(sizes[idx]);
  }

  // ---- Router ----
  function getHash() {
    const h = window.location.hash.replace('#', '').trim();
    const nameMatch = h.match(/^name\/(\d+)$/);
    if (nameMatch) return { view: 'names', deepLink: parseInt(nameMatch[1], 10) };
    const view = ['home', 'names', 'verses', 'practice', 'chant'].includes(h) ? h : 'home';
    return { view, deepLink: null };
  }

  function navigate(viewOrObj) {
    let view, deepLink;
    if (typeof viewOrObj === 'string') {
      view = viewOrObj;
    } else {
      view = viewOrObj.view;
      deepLink = viewOrObj.deepLink;
    }

    STATE.currentView = view;
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === view);
    });
    document.querySelectorAll('.view').forEach(v => {
      v.hidden = v.id !== 'view-' + view;
    });

    if (view === 'home') renderHome();
    else if (view === 'names') initNames(deepLink);
    else if (view === 'verses') renderVerse(STATE.currentVerse);
    else if (view === 'practice') initPractice();
    else if (view === 'chant') initChant();

    if (view !== 'chant' && STATE.chantTimer) {
      clearInterval(STATE.chantTimer);
      STATE.chantTimer = null;
    }
    if (view !== 'chant' && STATE.chantFullscreen) {
      STATE.chantFullscreen = false;
      document.body.classList.remove('chant-fullscreen');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }

    if (!deepLink) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  window.addEventListener('hashchange', () => navigate(getHash()));

  // ---- Name of the Day ----
  function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function getNameOfTheDay() {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const idx = Math.floor(seededRandom(seed) * TOTAL_NAMES);
    return DATA.names[idx];
  }

  function formatNumber(n) {
    return n.toLocaleString('en-IN');
  }

  // ---- Sadhana Tracker ----
  const SADHANA_KEY = 'lt_sadhana';

  function loadSadhana() {
    try {
      const raw = localStorage.getItem(SADHANA_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data.total === 'number' && Array.isArray(data.log)) return data;
      }
    } catch (e) { /* ignore */ }
    return { total: 0, log: [], streak: 0 };
  }

  function saveSadhana(data) {
    try { localStorage.setItem(SADHANA_KEY, JSON.stringify(data)); }
    catch (e) { /* ignore */ }
  }

  function logRecitation() {
    const data = loadSadhana();
    const today = todayStr();
    const existing = data.log.find(e => e.date === today);
    if (existing) existing.count++;
    else data.log.push({ date: today, count: 1 });
    data.total++;
    data.streak = calcStreak(data.log);
    saveSadhana(data);
    renderSadhana();
  }

  function calcStreak(log) {
    if (!log.length) return 0;
    const dateSet = new Set(log.filter(e => e.count > 0).map(e => e.date));
    let streak = 0;
    const d = new Date();
    while (true) {
      const ds = d.toISOString().slice(0, 10);
      if (dateSet.has(ds)) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }

  function renderSadhana() {
    const data = loadSadhana();
    const totalEl = document.getElementById('sadhana-total');
    const streakEl = document.getElementById('sadhana-streak');
    const monthEl = document.getElementById('sadhana-month');
    const lastEl = document.getElementById('sadhana-last');
    if (!totalEl) return;

    data.streak = calcStreak(data.log);
    totalEl.textContent = formatNumber(data.total);
    streakEl.textContent = data.streak;

    const now = new Date();
    const monthPrefix = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    let monthCount = 0;
    data.log.forEach(e => { if (e.date.startsWith(monthPrefix)) monthCount += e.count; });
    monthEl.textContent = formatNumber(monthCount);

    if (data.log.length > 0) {
      const sorted = [...data.log].sort((a, b) => b.date.localeCompare(a.date));
      const lastDate = new Date(sorted[0].date + 'T00:00:00');
      lastEl.textContent = 'Last: ' + lastDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } else {
      lastEl.textContent = '';
    }
  }

  document.getElementById('sadhana-log').addEventListener('click', logRecitation);

  // ---- Home View ----
  function renderHome() {
    const learned = STATE.learnedNames.size;
    document.getElementById('stat-names').textContent = formatNumber(TOTAL_NAMES);
    document.getElementById('stat-learned').textContent = formatNumber(learned);
    renderSadhana();

    const notd = getNameOfTheDay();
    const notdEl = document.getElementById('name-of-day');
    notdEl.innerHTML = `
      <div class="notd-number">Name #${notd.number} - Verse ${notd.verse}</div>
      <div class="notd-sanskrit">${notd.devanagari}</div>
      <div class="notd-translit">${escHtml(notd.iast)}</div>
      <div class="notd-meaning">${escHtml(notd.meaning)}</div>
    `;

    const dhyanaContent = document.getElementById('dhyana-content');
    if (dhyanaContent.children.length === 0) {
      dhyanaContent.innerHTML = `
        <div class="dhyana-verse">
          <div class="dhyana-deva">${DATA.dhyana.devanagari}</div>
          <div class="dhyana-translit">${escHtml(DATA.dhyana.iast)}</div>
          <div class="dhyana-meaning">${escHtml(DATA.dhyana.english)}</div>
        </div>
      `;
    }
  }

  document.getElementById('dhyana-toggle').addEventListener('click', () => {
    const content = document.getElementById('dhyana-content');
    const icon = document.getElementById('toggle-icon');
    const toggle = document.getElementById('dhyana-toggle');
    const isHidden = content.hidden;
    content.hidden = !isHidden;
    icon.textContent = isHidden ? '-' : '+';
    toggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  });

  document.getElementById('phala-shruti-toggle').addEventListener('click', () => {
    const content = document.getElementById('phala-shruti-content');
    const icon = document.getElementById('phala-shruti-toggle-icon');
    const toggle = document.getElementById('phala-shruti-toggle');
    const isHidden = content.hidden;
    content.hidden = !isHidden;
    icon.textContent = isHidden ? '-' : '+';
    toggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  });

  // ---- Names View ----
  let filteredNames = [];
  let namesScrollSentinel = null;

  function initNames(deepLinkNum) {
    STATE.renderOffset = 0;
    STATE.expandedCard = null;
    filterAndRenderNames();
    if (deepLinkNum && nameMap.has(deepLinkNum)) {
      scrollToAndExpandName(deepLinkNum);
    }
  }

  function scrollToAndExpandName(num) {
    const grid = document.getElementById('names-grid');
    while (STATE.renderOffset < filteredNames.length) {
      const existing = grid.querySelector(`[data-num="${num}"]`);
      if (existing) break;
      renderNamesBatch();
    }
    const card = grid.querySelector(`[data-num="${num}"]`);
    if (card) {
      if (STATE.expandedCard && STATE.expandedCard !== card) {
        STATE.expandedCard.classList.remove('expanded');
      }
      card.classList.add('expanded');
      STATE.expandedCard = card;
      requestAnimationFrame(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  function filterNames() {
    const q = STATE.nameSearchQuery.toLowerCase().trim();
    const filter = STATE.nameRangeFilter;
    const status = STATE.nameStatusFilter;

    let results = DATA.names;

    if (filter !== 'all') {
      if (filter.startsWith('kuta-')) {
        const kutaIdx = parseInt(filter.slice(5), 10);
        results = results.filter(n => n.kuta === kutaIdx);
      } else if (filter.startsWith('verse-')) {
        const [lo, hi] = filter.slice(6).split('-').map(Number);
        results = results.filter(n => n.verse >= lo && n.verse <= hi);
      } else if (filter.startsWith('num-')) {
        const [lo, hi] = filter.slice(4).split('-').map(Number);
        results = results.filter(n => n.number >= lo && n.number <= hi);
      }
    }

    if (status === 'learned') results = results.filter(n => isLearned(n.number));
    else if (status === 'unlearned') results = results.filter(n => !isLearned(n.number));

    if (q) {
      results = results.filter(n => {
        const numStr = String(n.number);
        return (
          n.devanagari.includes(q) ||
          n.iast.toLowerCase().includes(q) ||
          n.english.toLowerCase().includes(q) ||
          n.meaning.toLowerCase().includes(q) ||
          numStr === q
        );
      });
    }

    return results;
  }

  function filterAndRenderNames() {
    filteredNames = filterNames();
    STATE.renderOffset = 0;

    const grid = document.getElementById('names-grid');
    const empty = document.getElementById('names-empty');
    const counter = document.getElementById('names-counter');

    grid.innerHTML = '';

    const learnedInFilter = filteredNames.filter(n => isLearned(n.number)).length;
    counter.textContent = `${filteredNames.length} of ${TOTAL_NAMES} names` +
      (learnedInFilter > 0 ? ` - ${learnedInFilter} learned` : '');

    if (filteredNames.length === 0) {
      empty.hidden = false;
      removeSentinel();
      return;
    }

    empty.hidden = true;
    renderNamesBatch();
    setupScrollSentinel();
  }

  function renderNamesBatch() {
    if (STATE.isRendering) return;
    STATE.isRendering = true;

    const grid = document.getElementById('names-grid');
    const batch = filteredNames.slice(STATE.renderOffset, STATE.renderOffset + STATE.renderBatchSize);

    const frag = document.createDocumentFragment();
    batch.forEach(name => frag.appendChild(createNameCard(name)));
    grid.appendChild(frag);

    STATE.renderOffset += batch.length;
    STATE.isRendering = false;

    if (STATE.renderOffset >= filteredNames.length) removeSentinel();
  }

  function createNameCard(name) {
    const card = document.createElement('div');
    card.className = 'name-card' + (isLearned(name.number) ? ' learned' : '');
    card.dataset.num = name.number;

    const verse = verseMap.get(name.verse);
    const verseSanskrit = verse ? verse.devanagari : '';
    const sectionLabel = ['First Section', 'Second Section', 'Third Section'][name.kuta] || '';
    const existingNote = getNote(name.number);
    const hasNote = existingNote.length > 0;

    card.innerHTML = `
      <div class="name-tag">#${name.number}</div>
      ${hasNote ? '<div class="note-indicator"></div>' : ''}
      <div class="name-card-header">
        <div class="name-info">
          <div class="name-sanskrit">${name.devanagari}</div>
          <div class="name-translit">${escHtml(name.iast)}</div>
          <div class="name-meaning-short">${escHtml(name.meaning)}</div>
        </div>
      </div>
      <div class="name-details">
        <div class="name-detail-row">
          <div class="name-detail-label">Section</div>
          <div class="name-detail-value">${escHtml(sectionLabel)}</div>
        </div>
        <div class="name-detail-row">
          <div class="name-detail-label">Verse Context</div>
          <div class="name-detail-value">Verse ${name.verse}</div>
          ${verseSanskrit ? `<div class="name-detail-value sanskrit-verse">${verseSanskrit}</div>` : ''}
        </div>
        <div class="name-mantra">${escHtml(name.namavaliIast)}</div>
        <div class="name-namavali-deva">${name.namavaliDevanagari}</div>
        <div class="name-notes">
          <textarea class="note-input" placeholder="Add your personal notes..." data-note="${name.number}">${escHtml(existingNote)}</textarea>
        </div>
        <div class="name-actions">
          <button class="learn-btn ${isLearned(name.number) ? 'unmark' : 'mark'}" data-learn="${name.number}">
            ${isLearned(name.number) ? 'Unmark Learned' : 'Mark as Learned'}
          </button>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.learn-btn')) return;
      if (e.target.closest('.note-input')) return;
      toggleCardExpand(card, name.number);
    });

    const learnBtn = card.querySelector('.learn-btn');
    learnBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLearned(name.number);
      refreshNameCard(card, name);
      updateNamesCounter();
      updateHomeStats();
    });

    const noteInput = card.querySelector('.note-input');
    noteInput.addEventListener('click', (e) => e.stopPropagation());
    noteInput.addEventListener('blur', () => {
      const num = parseInt(noteInput.dataset.note, 10);
      const text = noteInput.value;
      setNote(num, text);
      const indicator = card.querySelector('.note-indicator');
      if (text.trim() && !indicator) {
        const dot = document.createElement('div');
        dot.className = 'note-indicator';
        card.appendChild(dot);
      } else if (!text.trim() && indicator) {
        indicator.remove();
      }
    });

    return card;
  }

  function toggleCardExpand(card, num) {
    if (STATE.expandedCard && STATE.expandedCard !== card) {
      STATE.expandedCard.classList.remove('expanded');
    }
    card.classList.toggle('expanded');
    STATE.expandedCard = card.classList.contains('expanded') ? card : null;
    if (STATE.expandedCard) history.replaceState(null, '', '#name/' + num);
    else history.replaceState(null, '', '#names');
  }

  function refreshNameCard(card, name) {
    const learned = isLearned(name.number);
    card.classList.toggle('learned', learned);
    const btn = card.querySelector('.learn-btn');
    if (btn) {
      btn.className = 'learn-btn ' + (learned ? 'unmark' : 'mark');
      btn.textContent = learned ? 'Unmark Learned' : 'Mark as Learned';
    }
  }

  function updateNamesCounter() {
    const counter = document.getElementById('names-counter');
    const learnedInFilter = filteredNames.filter(n => isLearned(n.number)).length;
    counter.textContent = `${filteredNames.length} of ${TOTAL_NAMES} names` +
      (learnedInFilter > 0 ? ` - ${learnedInFilter} learned` : '');
  }

  function updateHomeStats() {
    const learned = STATE.learnedNames.size;
    const statLearned = document.getElementById('stat-learned');
    if (statLearned) statLearned.textContent = formatNumber(learned);
  }

  function setupScrollSentinel() {
    removeSentinel();
    if (STATE.renderOffset >= filteredNames.length) return;
    namesScrollSentinel = document.createElement('div');
    namesScrollSentinel.style.height = '1px';
    document.getElementById('names-grid').appendChild(namesScrollSentinel);
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && STATE.renderOffset < filteredNames.length) {
        renderNamesBatch();
        if (STATE.renderOffset < filteredNames.length) {
          document.getElementById('names-grid').appendChild(namesScrollSentinel);
        } else {
          removeSentinel();
        }
      }
    }, { rootMargin: '200px' });
    observer.observe(namesScrollSentinel);
    namesScrollSentinel._observer = observer;
  }

  function removeSentinel() {
    if (namesScrollSentinel) {
      if (namesScrollSentinel._observer) namesScrollSentinel._observer.disconnect();
      namesScrollSentinel.remove();
      namesScrollSentinel = null;
    }
  }

  document.getElementById('names-search').addEventListener('input', debounce((e) => {
    STATE.nameSearchQuery = e.target.value;
    filterAndRenderNames();
  }, 200));

  document.getElementById('range-filter').addEventListener('change', (e) => {
    STATE.nameRangeFilter = e.target.value;
    filterAndRenderNames();
  });

  document.getElementById('status-filter').addEventListener('change', (e) => {
    STATE.nameStatusFilter = e.target.value;
    filterAndRenderNames();
  });

  // ---- Verses View ----
  function renderVerse(num) {
    num = Math.max(1, Math.min(TOTAL_VERSES, num));
    STATE.currentVerse = num;

    const verse = verseMap.get(num);
    const names = getNamesByVerse(num);
    const display = document.getElementById('verse-display');
    const jumpInput = document.getElementById('verse-jump');

    jumpInput.value = num;
    document.getElementById('verse-prev').disabled = num <= 1;
    document.getElementById('verse-next').disabled = num >= TOTAL_VERSES;

    const completedVerses = countCompletedVerses();
    const pct = TOTAL_VERSES > 0 ? (completedVerses / TOTAL_VERSES) * 100 : 0;
    document.getElementById('verse-progress-fill').style.width = pct + '%';
    document.getElementById('verse-progress-text').textContent =
      `${completedVerses} of ${TOTAL_VERSES} verses completed`;

    const allLearned = names.length > 0 && names.every(n => isLearned(n.number));

    let html = `
      <div class="verse-number-label">Verse ${num}</div>
      <div class="verse-sanskrit-text">${verse ? verse.devanagari : ''}</div>
      <div class="verse-names-list">
    `;

    names.forEach(n => {
      const learned = isLearned(n.number);
      html += `
        <div class="verse-name-item${learned ? ' learned' : ''}">
          <div class="verse-name-num">${n.number}</div>
          <div class="verse-name-info">
            <div class="verse-name-sanskrit">${n.devanagari}</div>
            <div class="verse-name-translit">${escHtml(n.iast)}</div>
            <div class="verse-name-meaning">${escHtml(n.meaning)}</div>
          </div>
        </div>
      `;
    });

    html += `</div>`;

    if (names.length > 0) {
      html += `
        <div class="verse-actions">
          <button class="verse-learn-btn ${allLearned ? 'unmark' : 'mark'}" id="verse-learn-toggle">
            ${allLearned ? 'Unmark Verse' : 'Mark Verse as Learned'}
          </button>
        </div>
      `;
    }

    display.innerHTML = html;

    const verseBtn = document.getElementById('verse-learn-toggle');
    if (verseBtn) {
      verseBtn.addEventListener('click', () => {
        const allCurrent = names.every(n => isLearned(n.number));
        names.forEach(n => {
          if (allCurrent) STATE.learnedNames.delete(n.number);
          else STATE.learnedNames.add(n.number);
        });
        saveProgress();
        renderVerse(STATE.currentVerse);
        updateHomeStats();
      });
    }
  }

  function countCompletedVerses() {
    let count = 0;
    for (let v = 1; v <= TOTAL_VERSES; v++) {
      const names = getNamesByVerse(v);
      if (names.length > 0 && names.every(n => isLearned(n.number))) count++;
    }
    return count;
  }

  document.getElementById('verse-prev').addEventListener('click', () => renderVerse(STATE.currentVerse - 1));
  document.getElementById('verse-next').addEventListener('click', () => renderVerse(STATE.currentVerse + 1));
  document.getElementById('verse-jump').addEventListener('change', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > TOTAL_VERSES) val = TOTAL_VERSES;
    renderVerse(val);
  });

  document.addEventListener('keydown', (e) => {
    if (STATE.currentView !== 'verses') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') renderVerse(STATE.currentVerse - 1);
    if (e.key === 'ArrowRight') renderVerse(STATE.currentVerse + 1);
  });

  // ---- Practice View ----
  function initPractice() {
    STATE.scoreGot = 0;
    STATE.scoreReview = 0;
    updatePracticeScore();
    buildPracticeQueue();
    showNextCard();
  }

  function buildPracticeQueue() {
    const scope = STATE.practiceScope;
    let pool = [];

    if (scope === 'due') {
      const srsData = loadSRS();
      const today = todayStr();
      pool = DATA.names.filter(n => {
        const entry = srsData[n.number];
        return !entry || entry.nextReview <= today;
      });
    } else if (scope === 'unlearned') {
      pool = DATA.names.filter(n => !isLearned(n.number));
    } else if (scope === 'all') {
      pool = [...DATA.names];
    } else if (scope.startsWith('kuta-')) {
      const kutaIdx = parseInt(scope.slice(5), 10);
      pool = DATA.names.filter(n => n.kuta === kutaIdx);
    } else if (scope.startsWith('verse-')) {
      const [lo, hi] = scope.slice(6).split('-').map(Number);
      pool = DATA.names.filter(n => n.verse >= lo && n.verse <= hi);
    }

    const srsData = loadSRS();
    const today = todayStr();
    pool.sort((a, b) => {
      const ea = srsData[a.number];
      const eb = srsData[b.number];
      const aOverdue = ea && ea.nextReview <= today;
      const bOverdue = eb && eb.nextReview <= today;
      const aNever = !ea;
      const bNever = !eb;
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      if (aNever && !bNever) return -1;
      if (!aNever && bNever) return 1;
      return (ea ? ea.interval : 0) - (eb ? eb.interval : 0);
    });

    STATE.practiceQueue = pool;
    STATE.practiceIndex = 0;
    updateDueCount();
  }

  function updateDueCount() {
    const dueEl = document.getElementById('practice-due-count');
    if (dueEl) {
      const count = countDueNames();
      dueEl.textContent = count > 0 ? `Due for review: ${count} names` : 'All caught up!';
    }
  }

  function showNextCard() {
    const container = document.querySelector('.flashcard-container');
    const flashcard = document.getElementById('flashcard');
    const actions = document.getElementById('practice-actions');
    const hint = document.getElementById('flip-hint');
    const empty = document.getElementById('practice-empty');

    if (STATE.practiceIndex >= STATE.practiceQueue.length) {
      if (STATE.practiceQueue.length === 0) {
        container.style.display = 'none';
        actions.hidden = true;
        hint.hidden = true;
        empty.hidden = false;
        return;
      }
      buildPracticeQueue();
    }

    container.style.display = '';
    empty.hidden = true;
    hint.hidden = false;

    const name = STATE.practiceQueue[STATE.practiceIndex];
    STATE.practiceFlipped = false;
    flashcard.classList.remove('flipped');
    actions.hidden = true;

    const front = document.getElementById('flashcard-front');
    const back = document.getElementById('flashcard-back');

    if (STATE.practiceMode === 's2m') {
      front.innerHTML = `
        <div class="flashcard-label">What does this name mean?</div>
        <div class="flashcard-sanskrit">${name.devanagari}</div>
        <div class="flashcard-translit">${escHtml(name.iast)}</div>
        <div class="flashcard-number">#${name.number}</div>
      `;
      back.innerHTML = `
        <div class="flashcard-label">Meaning</div>
        <div class="flashcard-meaning">${escHtml(name.meaning)}</div>
        <div class="flashcard-number">#${name.number} - ${escHtml(name.iast)}</div>
      `;
    } else {
      front.innerHTML = `
        <div class="flashcard-label">Which name is this?</div>
        <div class="flashcard-meaning">${escHtml(name.meaning)}</div>
        <div class="flashcard-number">#${name.number}</div>
      `;
      back.innerHTML = `
        <div class="flashcard-label">Sanskrit Name</div>
        <div class="flashcard-sanskrit">${name.devanagari}</div>
        <div class="flashcard-translit">${escHtml(name.iast)}</div>
        <div class="flashcard-number">#${name.number}</div>
      `;
    }
  }

  function flipCard() {
    const flashcard = document.getElementById('flashcard');
    const actions = document.getElementById('practice-actions');
    const hint = document.getElementById('flip-hint');
    if (!STATE.practiceFlipped) {
      flashcard.classList.add('flipped');
      STATE.practiceFlipped = true;
      actions.hidden = false;
      hint.hidden = true;
    }
  }

  function updatePracticeScore() {
    document.getElementById('score-got').textContent = STATE.scoreGot;
    document.getElementById('score-review').textContent = STATE.scoreReview;
  }

  document.getElementById('flashcard').addEventListener('click', flipCard);
  document.getElementById('flashcard').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flipCard();
    }
  });

  document.getElementById('btn-got').addEventListener('click', () => {
    const name = STATE.practiceQueue[STATE.practiceIndex];
    if (name) {
      markLearned(name.number);
      recordSRS(name.number, 5);
    }
    STATE.scoreGot++;
    STATE.practiceIndex++;
    updatePracticeScore();
    updateDueCount();
    updateHomeStats();
    showNextCard();
  });

  document.getElementById('btn-review').addEventListener('click', () => {
    const name = STATE.practiceQueue[STATE.practiceIndex];
    if (name) recordSRS(name.number, 1);
    STATE.scoreReview++;
    STATE.practiceIndex++;
    updatePracticeScore();
    updateDueCount();
    showNextCard();
  });

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.practiceMode = btn.dataset.mode;
      showNextCard();
    });
  });

  document.getElementById('practice-scope').addEventListener('change', (e) => {
    STATE.practiceScope = e.target.value;
    STATE.scoreGot = 0;
    STATE.scoreReview = 0;
    updatePracticeScore();
    buildPracticeQueue();
    showNextCard();
  });

  document.addEventListener('keydown', (e) => {
    if (STATE.currentView !== 'practice') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!STATE.practiceFlipped) flipCard();
    } else if (e.key === 'ArrowRight' || e.key === 'g') {
      if (STATE.practiceFlipped) document.getElementById('btn-got').click();
    } else if (e.key === 'ArrowLeft' || e.key === 'r') {
      if (STATE.practiceFlipped) document.getElementById('btn-review').click();
    }
  });

  // ---- Chant View ----
  const CHANT_POS_KEY = 'lt_chant_pos';
  const CHANT_SETTINGS_KEY = 'lt_chant_settings';
  const DEVA_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

  function toDevanagariNum(n) {
    return String(n).split('').map(d => DEVA_DIGITS[parseInt(d, 10)]).join('');
  }

  function loadChantSettings() {
    try {
      const raw = localStorage.getItem(CHANT_SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.speed === 'number') STATE.chantSpeed = s.speed;
        if (typeof s.showTranslit === 'boolean') STATE.chantShowTranslit = s.showTranslit;
        if (typeof s.showMeaning === 'boolean') STATE.chantShowMeaning = s.showMeaning;
        if (typeof s.auto === 'boolean') STATE.chantAuto = s.auto;
      }
    } catch (e) { /* ignore */ }
    try {
      const pos = localStorage.getItem(CHANT_POS_KEY);
      if (pos) {
        const v = parseInt(pos, 10);
        if (v >= 1 && v <= TOTAL_VERSES) STATE.chantVerse = v;
      }
    } catch (e) { /* ignore */ }
  }

  function saveChantSettings() {
    try {
      localStorage.setItem(CHANT_SETTINGS_KEY, JSON.stringify({
        speed: STATE.chantSpeed,
        showTranslit: STATE.chantShowTranslit,
        showMeaning: STATE.chantShowMeaning,
        auto: STATE.chantAuto,
      }));
    } catch (e) { /* ignore */ }
  }

  function saveChantPos() {
    try { localStorage.setItem(CHANT_POS_KEY, String(STATE.chantVerse)); }
    catch (e) { /* ignore */ }
  }

  function initChant() {
    loadChantSettings();
    document.getElementById('chant-start').value = STATE.chantVerse;
    document.getElementById('chant-auto').checked = STATE.chantAuto;
    document.getElementById('chant-auto-label').textContent = STATE.chantAuto ? 'On' : 'Off';
    document.getElementById('chant-speed').value = STATE.chantSpeed;
    document.getElementById('chant-speed-label').textContent = STATE.chantSpeed + 's';
    document.getElementById('chant-show-translit').checked = STATE.chantShowTranslit;
    document.getElementById('chant-show-meaning').checked = STATE.chantShowMeaning;

    buildChantDots();
    renderChantVerse(STATE.chantVerse);
    if (STATE.chantAuto) startChantTimer();
  }

  function buildChantDots() {
    const container = document.getElementById('chant-dots');
    container.innerHTML = '';
    for (let i = 1; i <= TOTAL_VERSES; i++) {
      const dot = document.createElement('span');
      dot.className = 'chant-dot' + (i === STATE.chantVerse ? ' active' : '');
      dot.dataset.verse = i;
      container.appendChild(dot);
    }
  }

  function updateChantDots() {
    document.querySelectorAll('.chant-dot').forEach(d => {
      d.classList.toggle('active', parseInt(d.dataset.verse, 10) === STATE.chantVerse);
    });
    const activeDot = document.querySelector('.chant-dot.active');
    if (activeDot) activeDot.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  function renderChantVerse(num) {
    num = Math.max(1, Math.min(TOTAL_VERSES, num));
    STATE.chantVerse = num;
    saveChantPos();

    const verse = verseMap.get(num);
    const names = getNamesByVerse(num);
    const stage = document.getElementById('chant-stage');

    stage.classList.add('chant-fade');

    setTimeout(() => {
      document.getElementById('chant-verse-num').textContent = '॥ ' + toDevanagariNum(num) + ' ॥';
      document.getElementById('chant-sanskrit').textContent = verse ? verse.devanagari : '';

      const translitEl = document.getElementById('chant-translit');
      if (STATE.chantShowTranslit && names.length > 0) {
        translitEl.textContent = names.map(n => n.iast).join(' | ');
        translitEl.hidden = false;
      } else {
        translitEl.hidden = true;
      }

      const meaningsEl = document.getElementById('chant-meanings');
      if (STATE.chantShowMeaning && names.length > 0) {
        meaningsEl.innerHTML = names.map(n =>
          '<div><strong>' + escHtml(n.iast) + '</strong> - ' + escHtml(n.meaning) + '</div>'
        ).join('');
        meaningsEl.hidden = false;
      } else {
        meaningsEl.hidden = true;
      }

      document.getElementById('chant-verse-info').textContent = 'Verse ' + num + ' of ' + TOTAL_VERSES;
      document.getElementById('chant-start').value = num;
      document.getElementById('chant-prev').disabled = num <= 1;
      document.getElementById('chant-next').disabled = num >= TOTAL_VERSES;

      updateChantDots();
      stage.classList.remove('chant-fade');
    }, 150);
  }

  function chantNext() {
    if (STATE.chantVerse >= TOTAL_VERSES) {
      if (STATE.chantAuto) {
        stopChantTimer();
        STATE.chantAuto = false;
        document.getElementById('chant-auto').checked = false;
        document.getElementById('chant-auto-label').textContent = 'Off';
        saveChantSettings();
      }
      return;
    }
    renderChantVerse(STATE.chantVerse + 1);
  }

  function chantPrev() {
    if (STATE.chantVerse <= 1) return;
    renderChantVerse(STATE.chantVerse - 1);
  }

  function startChantTimer() {
    stopChantTimer();
    STATE.chantTimer = setInterval(chantNext, STATE.chantSpeed * 1000);
  }

  function stopChantTimer() {
    if (STATE.chantTimer) {
      clearInterval(STATE.chantTimer);
      STATE.chantTimer = null;
    }
  }

  function toggleChantFullscreen() {
    STATE.chantFullscreen = !STATE.chantFullscreen;
    document.body.classList.toggle('chant-fullscreen', STATE.chantFullscreen);
    const btn = document.getElementById('chant-fullscreen');
    btn.textContent = STATE.chantFullscreen ? 'Exit Full Screen' : 'Full Screen';
    if (STATE.chantFullscreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }

  document.getElementById('chant-prev').addEventListener('click', chantPrev);
  document.getElementById('chant-next').addEventListener('click', chantNext);
  document.getElementById('chant-fullscreen').addEventListener('click', toggleChantFullscreen);

  document.getElementById('chant-settings-toggle').addEventListener('click', () => {
    const panel = document.getElementById('chant-settings');
    panel.hidden = !panel.hidden;
  });

  document.getElementById('chant-start').addEventListener('change', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > TOTAL_VERSES) val = TOTAL_VERSES;
    renderChantVerse(val);
  });

  document.getElementById('chant-auto').addEventListener('change', (e) => {
    STATE.chantAuto = e.target.checked;
    document.getElementById('chant-auto-label').textContent = STATE.chantAuto ? 'On' : 'Off';
    saveChantSettings();
    if (STATE.chantAuto) startChantTimer();
    else stopChantTimer();
  });

  document.getElementById('chant-speed').addEventListener('input', (e) => {
    STATE.chantSpeed = parseInt(e.target.value, 10);
    document.getElementById('chant-speed-label').textContent = STATE.chantSpeed + 's';
    saveChantSettings();
    if (STATE.chantAuto) startChantTimer();
  });

  document.getElementById('chant-show-translit').addEventListener('change', (e) => {
    STATE.chantShowTranslit = e.target.checked;
    saveChantSettings();
    renderChantVerse(STATE.chantVerse);
  });

  document.getElementById('chant-show-meaning').addEventListener('change', (e) => {
    STATE.chantShowMeaning = e.target.checked;
    saveChantSettings();
    renderChantVerse(STATE.chantVerse);
  });

  document.addEventListener('keydown', (e) => {
    if (STATE.currentView !== 'chant') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); chantNext(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); chantPrev(); }
    else if (e.key === 'f' || e.key === 'F') toggleChantFullscreen();
    else if (e.key === 'Escape' && STATE.chantFullscreen) toggleChantFullscreen();
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && STATE.chantFullscreen) {
      STATE.chantFullscreen = false;
      document.body.classList.remove('chant-fullscreen');
      const btn = document.getElementById('chant-fullscreen');
      if (btn) btn.textContent = 'Full Screen';
    }
  });

  document.getElementById('chant-dots').addEventListener('click', (e) => {
    const dot = e.target.closest('.chant-dot');
    if (dot && dot.dataset.verse) renderChantVerse(parseInt(dot.dataset.verse, 10));
  });

  // ---- Utility ----
  function escHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ---- Export / Import ----
  const EXPECTED_KEYS = ['lt_learned', 'lt_srs', 'lt_notes', 'lt_sadhana', 'lt_fontsize', 'lt_chant_pos', 'lt_chant_settings', 'lt_theme'];

  function exportData() {
    const data = {};
    EXPECTED_KEYS.forEach(key => {
      const val = localStorage.getItem(key);
      if (val !== null) {
        try { data[key] = JSON.parse(val); }
        catch (e) { data[key] = val; }
      }
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lalita-trishati-backup-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const hasValidKey = EXPECTED_KEYS.some(key => key in data);
        if (!hasValidKey) {
          alert('Invalid backup file. No recognized data found.');
          return;
        }
        if (!confirm('This will replace your current progress. Continue?')) return;
        EXPECTED_KEYS.forEach(key => {
          if (key in data) {
            const val = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
            localStorage.setItem(key, val);
          }
        });
        window.location.reload();
      } catch (err) {
        alert('Failed to read backup file. Make sure it is a valid JSON file.');
      }
    };
    reader.readAsText(file);
  }

  document.getElementById('export-data').addEventListener('click', exportData);
  document.getElementById('import-data').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importData(file);
      e.target.value = '';
    }
  });

  // ---- Theme ----
  const THEME_KEY = 'lt_theme';
  const THEME_CYCLE = ['system', 'light', 'dark'];
  const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

  function getStoredTheme() {
    return localStorage.getItem(THEME_KEY) || 'system';
  }

  function applyTheme(mode) {
    const html = document.documentElement;
    if (mode === 'dark') html.setAttribute('data-theme', 'dark');
    else if (mode === 'light') html.setAttribute('data-theme', 'light');
    else html.removeAttribute('data-theme');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = THEME_LABELS[mode];
    localStorage.setItem(THEME_KEY, mode);
  }

  function cycleTheme() {
    const current = getStoredTheme();
    const idx = THEME_CYCLE.indexOf(current);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    applyTheme(next);
  }

  function initTheme() {
    applyTheme(getStoredTheme());
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', cycleTheme);
  }

  function injectFontControls() {
    const controls = document.getElementById('font-controls');
    if (!controls) return;
    controls.innerHTML = '<button class="font-btn" id="font-dec" aria-label="Decrease font size">A-</button><button class="font-btn" id="font-inc" aria-label="Increase font size">A+</button>';
    document.getElementById('font-dec').addEventListener('click', () => cycleFontSize(-1));
    document.getElementById('font-inc').addEventListener('click', () => cycleFontSize(1));
  }

  function injectDueCountEl() {
    const scoreEl = document.getElementById('practice-score');
    if (!scoreEl) return;
    const dueEl = document.createElement('div');
    dueEl.className = 'practice-due-count';
    dueEl.id = 'practice-due-count';
    scoreEl.insertAdjacentElement('afterend', dueEl);
  }

  // ---- Init ----
  function init() {
    initTheme();
    loadProgress();
    loadFontSize();
    injectFontControls();
    injectDueCountEl();
    navigate(getHash());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
