/* =========================================================
   图案的奇迹 · 浦东美术馆伊斯兰艺术线上展厅
   ========================================================= */
(() => {
  'use strict';

  const DATA = window.MUSEUM_DATA;
  const MAP = window.MUSEUM_MAP;
  if (!DATA || !Array.isArray(DATA.rooms)) {
    document.body.innerHTML = '<p style="color:#e8dcc4;font-family:serif;padding:40px">展厅数据加载失败。</p>';
    return;
  }

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const pad2 = n => String(n).padStart(2, '0');
  const isMobileLayout = () => window.innerWidth <= 720;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const IMG_FALLBACK = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#16130f"/><text x="320" y="240" fill="#8c7f68" font-size="22" font-family="serif" text-anchor="middle">图像暂不可用</text></svg>');
  document.addEventListener('error', e => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.imgFallback === '1') return;
    if (img.closest('#viewerArt') || img.closest('#wikiLightbox')) return;
    img.dataset.imgFallback = '1';
    img.classList.add('img-fallback');
    img.src = IMG_FALLBACK;
  }, true);

  const HALL_BY_ID = Object.fromEntries(DATA.halls.map(h => [h.id, h]));
  const ROOM_BY_ID = Object.fromEntries(DATA.rooms.map(r => [r.id, r]));
  const CIV_BY_ID = Object.fromEntries(DATA.civs.map(c => [c.id, c]));
  const PLACE_BY_ID = Object.fromEntries(DATA.places.map(p => [p.id, p]));
  const WIKI = Array.isArray(DATA.wikiEntries) ? DATA.wikiEntries : [];
  const WIKI_BY_ID = Object.fromEntries(WIKI.map(w => [w.id, w]));
  const WIKI_TYPE_LABEL = { civ: '帝国', topic: '专题' };
  const CAT_ORDER = ['陶瓷', '金属器', '玉器与宝石', '玻璃器', '织物与地毯', '书画与细密画', '木器与象牙', '建筑装饰', '兵器与仪仗'];

  const FLAT = [];
  DATA.rooms.forEach((room, ri) => {
    room.exhibits.forEach((ex, ei) => {
      FLAT.push({ room, ri, ex, ei, global: FLAT.length + 1, hall: HALL_BY_ID[room.hall] });
    });
  });
  const EX_BY_ID = Object.fromEntries(FLAT.map(f => [f.ex.id, f]));

  const STORAGE_KEY = 'islamic-patterns-museum-visited-v1';
  const state = {
    started: false,
    roomIndex: 0,
    panX: 0,
    targetPan: 0,
    panRaf: 0,
    dragging: false,
    dragMoved: false,
    dragStartX: 0,
    dragStartPan: 0,
    dragLastX: 0,
    dragLastT: 0,
    dragVelocity: 0,
    visited: new Set(),
    detail: null,
    detailFrom: 'gallery',
    overlay: null,
    catalogFilter: 'all',
    catalogQuery: '',
    catalogScroll: 0,
    artworks: [],
    wallMax: 0,
    pointerX: null,
    depthRaf: 0,
    subReturn: 'home',
    filter: { civ: null, place: null, limit: 120 },
    wiki: { type: 'all', query: '', scroll: 0 },
    wikiEntry: null,
    wikiFrom: 'home',
    wikiReturn: 'list',
    wikiLight: { index: 0, scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 },
    map: {
      year: 1600,
      selected: 'mughal',
      cardOpen: false,
      scale: 1,
      tx: 0,
      ty: 0,
      dragging: false,
      moved: false,
      startX: 0,
      startY: 0,
      origTx: 0,
      origTy: 0,
      pointers: new Map(),
      pinch: null
    },
    viewer: {
      natW: 1, natH: 1, fit: 1, scale: 1, x: 0, y: 0,
      mode: 'all', dragging: false, startX: 0, startY: 0, origX: 0, origY: 0,
      fullscreen: false, pointers: new Map(), pinch: null
    },
    timeline: {
      scale: 1, x: 0, targetX: 0, dragging: false, moved: false,
      startX: 0, origX: 0, selectedKey: null, built: false
    }
  };

  const preloaded = new Set();
  let toastTimer = 0;
  let loadingDone = false;
  let mobileHintShown = false;

  /* ---------- 通用 ---------- */
  function civOf(ex) { return CIV_BY_ID[ex.civId] || CIV_BY_ID.mughal; }
  function placeOf(ex) { return PLACE_BY_ID[ex.placeId] || PLACE_BY_ID.iran; }
  function yearLabel(y) {
    const n = Math.abs(Math.round(y));
    return y < 0 ? `公元前 ${n} 年` : `${n} 年`;
  }
  function yearRange(c) {
    return `${c.start}—${c.end}`;
  }
  function regionLabelOf(c) {
    return ({ 'south-asia': '南亚', iran: '伊朗高原', anatolia: '安纳托利亚与黎凡特', 'central-asia': '中亚', 'levant-egypt': '埃及与叙利亚' })[c.region] || '伊斯兰世界';
  }
  function periodText(ex) {
    return `${civOf(ex).name} · ${placeOf(ex).name}`;
  }
  function hallRooms(hallId) {
    return DATA.rooms.map((r, i) => ({ room: r, index: i })).filter(x => x.room.hall === hallId);
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    $('#toast').classList.remove('show');
  }

  /* ---------- 进度 ---------- */
  function loadVisited() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      const valid = new Set(FLAT.map(f => f.ex.id));
      if (Array.isArray(arr)) arr.forEach(id => { if (valid.has(id)) state.visited.add(id); });
    } catch (e) { /* ignore */ }
  }
  function saveVisited() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(state.visited))); } catch (e) { /* ignore */ }
  }
  function markVisited(id) {
    if (!id || state.visited.has(id)) return;
    state.visited.add(id);
    saveVisited();
    updateProgress();
    $$('.artwork').forEach(el => { if (el.dataset.id === id) el.classList.add('visited'); });
    $$('.cat-card').forEach(el => { if (el.dataset.id === id) el.classList.add('visited'); });
  }
  function updateProgress() {
    const total = DATA.meta.total || 1;
    const n = state.visited.size;
    $('#progressText').textContent = `${n} / ${total}`;
    $('#progressBar').style.width = `${(n / total) * 100}%`;
  }

  /* ---------- 首页 ---------- */
  function renderHome() {
    $('#introStats').innerHTML = `
      <div><b>${DATA.meta.hallCount}</b><span>个展厅</span></div>
      <div><b>${DATA.meta.roomCount}</b><span>个单元</span></div>
      <div><b>${DATA.meta.total}</b><span>组展项</span></div>
      <div><b>${DATA.meta.imageCount}</b><span>幅图像</span></div>`;

    $('#hallGrid').innerHTML = DATA.halls.map(h => `
      <article class="hall-card" data-hall="${h.id}" tabindex="0" role="button" aria-label="进入${h.name}展厅" style="--hall-color:${h.color}">
        <div class="hall-bg"><img referrerpolicy="no-referrer" src="${esc(h.hero)}" alt="${esc(h.name)}展厅入口图"></div>
        <div class="hall-shade"></div>
        <div class="hall-copy">
          <div class="hall-top"><span class="hall-no">${h.no}</span><span class="hall-key">关键词 · ${esc(h.keyword)}</span></div>
          <h2 class="hall-name">${esc(h.name)}</h2>
          <p class="hall-en">${esc(h.en)}</p>
          <div class="hall-hover">
            <p>${esc(h.short)}</p>
            <p class="hall-meta">${h.roomCount} 个单元 · ${h.exhibitCount} 组展项</p>
            <span class="hall-enter">进入展厅 <i>→</i></span>
          </div>
        </div>
      </article>`).join('');

    $$('.hall-card').forEach(card => {
      const go = () => enterHall(card.dataset.hall);
      card.addEventListener('click', go);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });

    const bg = DATA.meta.homeBg || DATA.halls[0].hero;
    const introBg = $('#introBg');
    introBg.src = bg;
    introBg.alt = DATA.meta.homeBgCaption || '展厅文物背景';
    introBg.title = DATA.meta.homeBgCaption || '';
  }

  function enterHall(hallId) {
    const rooms = hallRooms(hallId);
    if (!rooms.length) return;
    startGallery();
    const first = rooms.find(x => x.room.exhibits.length) || rooms[0];
    enterRoom(first.index, true, 'start');
  }

  /* ---------- 展厅 ---------- */
  function frameSize(ex) {
    const img = ex.hero || { w: 1000, h: 1000 };
    const r = (img.w || 1000) / (img.h || 1000);
    const desktop = !isMobileLayout();
    let fw, fh;
    if (r >= 1.8) { fw = 430; fh = 260; }
    else if (r >= 1.3) { fw = 380; fh = 290; }
    else if (r >= 0.95) { fw = 330; fh = 330; }
    else if (r >= 0.72) { fw = 290; fh = 380; }
    else if (r >= 0.52) { fw = 260; fh = 430; }
    else { fw = 220; fh = 480; }
    const vhScale = clamp((window.innerHeight - 150) / 660, 0.6, 1);
    fw = Math.round(fw * vhScale);
    fh = Math.round(fh * vhScale);
    if (!desktop) { fw = Math.round(fw * 0.68); fh = Math.round(fh * 0.68); }
    return { w: fw, h: fh, r };
  }

  function buildRoomTitlePanel(room) {
    const hall = HALL_BY_ID[room.hall];
    const el = document.createElement('div');
    el.className = 'room-title-panel';
    const terms = (room.knowledge || []).length
      ? `<div class="rt-terms">${room.knowledge.map(k => `<span>${esc(k.term)}</span>`).join('')}</div>`
      : '';
    el.innerHTML = `
      <p class="rt-chapter">${esc(hall.name)} · ${esc(room.chapter)}</p>
      <h2 class="rt-title">${esc(room.title)}</h2>
      <p class="rt-sub">${esc(room.subtitle)}</p>
      <p class="rt-intro">${esc(room.intro[0] || '')}</p>
      ${terms}
      <p class="rt-count">${room.exhibits.length} 组展项 · 按展厅顺序陈列</p>`;
    return el;
  }

  function buildSectionPanel(section) {
    const el = document.createElement('div');
    el.className = 'section-panel';
    el.innerHTML = `
      <span class="sp-line"></span>
      ${section.region ? `<p class="sp-region">${esc(section.region)}</p>` : ''}
      <h3>${esc(section.title)}</h3>
      ${section.intro && section.intro.length ? section.intro.slice(0, 2).map(p => `<p>${esc(p)}</p>`).join('') : ''}`;
    return el;
  }

  function buildArtwork(ex, index, roomIndex) {
    const size = frameSize(ex);
    const el = document.createElement('article');
    el.className = 'artwork' + (state.visited.has(ex.id) ? ' visited' : '');
    el.dataset.id = ex.id;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${ex.name}，${civOf(ex).name}，${placeOf(ex).name}`);
    el.style.setProperty('--fw', `${size.w}px`);
    el.style.setProperty('--fh', `${size.h}px`);
    el.style.setProperty('--mw', `${size.w - 44}px`);
    el.style.setProperty('--mh', `${size.h - 44}px`);

    el.innerHTML = `
      <div class="artwork-inner">
        <div class="spot"></div>
        <div class="frame">
          <span class="badge">${esc(ex.category)}</span>
          <div class="mat">
            <img loading="lazy" referrerpolicy="no-referrer" src="${esc(ex.hero.src)}" alt="${esc(ex.name)}">
          </div>
        </div>
        <div class="label">
          <span class="no">${pad2(index + 1)}</span>
          <span class="txt">
            <span class="name">${esc(ex.name)}<i class="visit-dot"></i></span>
            <span class="meta">${esc(civOf(ex).name)} · ${esc(placeOf(ex).name)}</span>
          </span>
        </div>
      </div>`;

    let opening = false;
    const open = () => {
      if (state.dragMoved || opening) return;
      opening = true;
      el.classList.add('tap-pop');
      setTimeout(() => {
        opening = false;
        if (!state.dragMoved) openDetail(roomIndex, index, 0, 'gallery');
      }, 240);
      setTimeout(() => el.classList.remove('tap-pop'), 520);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    return el;
  }

  function buildDoor(roomIndex) {
    const hallRoomsList = hallRooms(DATA.rooms[roomIndex].hall);
    const pos = hallRoomsList.findIndex(x => x.index === roomIndex);
    const next = hallRoomsList[pos + 1];
    const el = document.createElement('div');
    if (next) {
      el.className = 'door-panel';
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.innerHTML = `
        <span class="door-kicker">NEXT GALLERY</span>
        <span class="door-title">${esc(next.room.title)}</span>
        <span class="door-sub">${esc(next.room.subtitle)}</span>
        <span class="door-arrow">→</span>
        <span class="door-sub">点击进入下一单元</span>`;
      const go = () => enterRoom(next.index, true, 'start');
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    } else {
      el.className = 'end-panel';
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.innerHTML = `
        <span class="door-kicker">END OF THIS HALL</span>
        <span class="door-title">本厅终点</span>
        <span class="door-sub">${esc(HALL_BY_ID[DATA.rooms[roomIndex].hall].name)} · 参观完毕</span>
        <span class="door-arrow">玉</span>
        <span class="door-sub">点击返回首页，选择其他展厅</span>`;
      const go = () => backHome();
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    }
    return el;
  }

  function buildBackgroundPanel(room) {
    const links = relatedWikiForRoom(room);
    const el = document.createElement('div');
    el.className = 'room-empty-note';
    el.innerHTML = `
      <h3>本单元为背景导言</h3>
      <p>这一单元以地图、背景照片与展陈空间为主。按照新的整理方式，这些延伸配图与历史、工艺背景介绍已移入百科词条，不在展品墙和文物目录中重复出现。</p>
      <div class="room-empty-links">
        ${links.map(w => `<button type="button" data-wiki="${esc(w.id)}">${esc(w.title)} →</button>`).join('')}
      </div>`;
    $$('[data-wiki]', el).forEach(btn => {
      btn.addEventListener('click', () => openWikiEntry(btn.dataset.wiki, 'gallery'));
    });
    return el;
  }

  function renderWall(index) {
    if (state.panRaf) { cancelAnimationFrame(state.panRaf); state.panRaf = 0; }
    const room = DATA.rooms[index];
    const wall = $('#wall');
    wall.style.transform = 'translate3d(0,0,0)';
    wall.innerHTML = '';
    wall.appendChild(buildRoomTitlePanel(room));
    if (!room.exhibits.length) wall.appendChild(buildBackgroundPanel(room));
    let lastSection = null;
    room.exhibits.forEach((ex, ei) => {
      if (ex.section && ex.section !== lastSection) {
        const sec = (room.sections || []).find(s => s.title === ex.section);
        wall.appendChild(buildSectionPanel(sec || { title: ex.section, intro: [] }));
        lastSection = ex.section;
      }
      wall.appendChild(buildArtwork(ex, ei, index));
    });
    wall.appendChild(buildDoor(index));
    const tail = document.createElement('div');
    tail.className = 'wall-tail';
    wall.appendChild(tail);
    requestAnimationFrame(() => {
      measureWall();
      applyPanInstant(0);
    });
  }

  function measureWall() {
    const wall = $('#wall');
    const vp = $('#wallViewport');
    state.artworks = $$('.artwork', wall).map(el => ({
      el,
      inner: el.firstElementChild,
      left: el.offsetLeft,
      width: el.offsetWidth
    }));
    const last = wall.lastElementChild;
    const contentRight = last ? last.offsetLeft + last.offsetWidth : wall.scrollWidth;
    state.wallMax = Math.max(0, contentRight - vp.clientWidth);
    updateNav();
  }

  function applyPanInstant(x) {
    state.panX = clamp(x, 0, state.wallMax);
    state.targetPan = state.panX;
    $('#wall').style.transform = `translate3d(${-state.panX}px,0,0)`;
    const fill = state.wallMax ? (state.panX / state.wallMax) * 100 : 0;
    $('#panFill').style.width = `${fill}%`;
    updateDepth();
    updateNav();
  }

  function setPanTarget(x) {
    state.targetPan = clamp(x, 0, state.wallMax);
    if (!state.panRaf) state.panRaf = requestAnimationFrame(panLoop);
  }

  function panLoop() {
    const diff = state.targetPan - state.panX;
    if (Math.abs(diff) < 0.6) {
      state.panX = state.targetPan;
      applyPanInstant(state.panX);
      state.panRaf = 0;
      return;
    }
    state.panX += diff * 0.2;
    $('#wall').style.transform = `translate3d(${-state.panX}px,0,0)`;
    const fill = state.wallMax ? (state.panX / state.wallMax) * 100 : 0;
    $('#panFill').style.width = `${fill}%`;
    updateDepth();
    updateNav();
    state.panRaf = requestAnimationFrame(panLoop);
  }

  function updateDepth() {
    if (window.innerWidth < 900) return;
    const vw = window.innerWidth;
    const half = vw / 2;
    const px = state.dragging ? null : state.pointerX;
    const range = 280;
    state.artworks.forEach(a => {
      const center = a.left - state.panX + a.width / 2;
      const d = (center - half) / half;
      const ry = clamp(-d * 4.5, -4.5, 4.5);
      const tz = -Math.min(Math.abs(d) * 55, 55);
      let scale = 1;
      let lift = 0;
      if (px != null) {
        const dist = Math.abs(center - px);
        if (dist < range) {
          const k = 1 - dist / range;
          scale = 1 + 0.1 * k * k;
          lift = -14 * k * k;
        }
      }
      a.inner.style.transform =
        `translate3d(0,${lift.toFixed(2)}px,${tz}px) rotateY(${ry}deg) scale(${scale.toFixed(3)})`;
    });
  }

  function updateNav() {
    const atStart = state.panX <= 1;
    const atEnd = state.panX >= state.wallMax - 1;
    const rooms = hallRooms(DATA.rooms[state.roomIndex].hall);
    const pos = rooms.findIndex(x => x.index === state.roomIndex);
    $('#prevBtn').disabled = atStart && pos === 0;
    $('#nextBtn').disabled = atEnd && pos === rooms.length - 1;
  }

  function step(dir) {
    const vw = $('#wallViewport').clientWidth;
    if (dir > 0 && state.panX >= state.wallMax - 2) {
      const rooms = hallRooms(DATA.rooms[state.roomIndex].hall);
      const pos = rooms.findIndex(x => x.index === state.roomIndex);
      if (pos < rooms.length - 1) enterRoom(rooms[pos + 1].index, true, 'start');
      return;
    }
    if (dir < 0 && state.panX <= 2) {
      const rooms = hallRooms(DATA.rooms[state.roomIndex].hall);
      const pos = rooms.findIndex(x => x.index === state.roomIndex);
      if (pos > 0) enterRoom(rooms[pos - 1].index, true, 'end');
      return;
    }
    setPanTarget(state.targetPan + dir * vw * 0.7);
  }

  function enterRoom(index, showThreshold = true, position = 'start') {
    if (index < 0 || index >= DATA.rooms.length) return;
    if (state.panRaf) { cancelAnimationFrame(state.panRaf); state.panRaf = 0; }
    state.roomIndex = index;
    renderWall(index);
    updateTop();
    updateRoute();
    preloadRoom(index);
    preloadRoom(index + 1);
    if (showThreshold) showThresholdPanel(index);
    else {
      $('#threshold').hidden = true;
      if (state.overlay === 'threshold') state.overlay = null;
    }
    if (position === 'end') {
      requestAnimationFrame(() => {
        measureWall();
        applyPanInstant(state.wallMax);
      });
    }
  }

  function preloadRoom(index) {
    if (index < 0 || index >= DATA.rooms.length || preloaded.has(index)) return;
    preloaded.add(index);
    DATA.rooms[index].exhibits.slice(0, 40).forEach(ex => {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.src = ex.hero.src;
    });
  }

  function updateTop() {
    const room = DATA.rooms[state.roomIndex];
    const hall = HALL_BY_ID[room.hall];
    const rooms = hallRooms(hall.id);
    const pos = rooms.findIndex(x => x.index === state.roomIndex);
    $('#gallery').dataset.hall = hall.id;
    $('#roomChapter').textContent = `${hall.name} · ${pad2(pos + 1)} / ${pad2(rooms.length)}`;
    $('#roomTitle').innerHTML = `<span>${esc(room.title)}</span><span class="room-sub-label"> · ${esc(room.subtitle)}</span>`;
    updateProgress();
    updateRoute();
    renderHallSwitch();
  }

  function renderHallSwitch() {
    const current = DATA.rooms[state.roomIndex].hall;
    $('#hallSwitch').innerHTML = DATA.halls.map(h => `
      <button type="button" class="hall-chip${h.id === current ? ' active' : ''}" data-hall="${h.id}" style="--hall-color:${h.color}">${esc(h.name)}</button>`).join('');
    $$('.hall-chip', $('#hallSwitch')).forEach(btn => {
      btn.addEventListener('click', () => enterHall(btn.dataset.hall));
    });
  }

  let routeHall = null;
  function renderHallRoute(hallId) {
    if (routeHall === hallId) return;
    routeHall = hallId;
    const route = $('#roomRoute');
    route.innerHTML = '';
    const h = HALL_BY_ID[hallId];
    const label = document.createElement('div');
    label.className = 'route-hall-label active';
    label.textContent = h.name;
    route.appendChild(label);
    hallRooms(hallId).forEach(({ room, index }) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'route-node';
      node.dataset.index = String(index);
      node.style.setProperty('--hall-color', h.color);
      node.innerHTML = `<div class="rn-top"><span>${pad2(index + 1)}</span><i></i></div><span class="rn-title">${esc(room.title)}</span>`;
      node.addEventListener('click', () => enterRoom(index, true, 'start'));
      route.appendChild(node);
    });
  }

  function renderRoutes() {
    const guide = $('#guideRoute');
    guide.innerHTML = '';
    routeHall = null;
    DATA.halls.forEach(h => {
      const g = document.createElement('div');
      g.className = 'guide-route-item';
      g.innerHTML = `<b>${h.no}</b><span>${esc(h.name)}</span><small>${hallRooms(h.id).map(x => esc(x.room.title)).join(' · ')}</small>`;
      guide.appendChild(g);
    });
  }

  function updateRoute() {
    const currentHall = DATA.rooms[state.roomIndex].hall;
    renderHallRoute(currentHall);
    $$('.route-node').forEach(node => {
      const room = DATA.rooms[+node.dataset.index];
      node.classList.toggle('active', +node.dataset.index === state.roomIndex);
      node.classList.toggle('visited', room.exhibits.some(ex => state.visited.has(ex.id)));
    });
    if (isMobileLayout()) {
      const active = $('.route-node.active', $('#roomRoute'));
      if (active) requestAnimationFrame(() => active.scrollIntoView({ block: 'nearest', inline: 'center' }));
    }
  }

  /* ---------- 门槛 ---------- */
  function knowledgeHtml(room) {
    const parts = [];
    const wlinks = relatedWikiForRoom(room);
    if (wlinks.length) {
      parts.push(`<div class="threshold-wiki">
        <p class="tk-title">相关词条 · 延伸阅读</p>
        <div class="tw-chips">${wlinks.map(w => `<button type="button" class="tw-chip${w.type === 'site' ? ' site' : ''}" data-wiki="${esc(w.id)}">${wikiTypeLabel(w.type)} · ${esc(w.title)}</button>`).join('')}</div>
      </div>`);
    }
    if (room.knowledge && room.knowledge.length) {
      parts.push(`<div class="threshold-knowledge">
        <p class="tk-title">单元关键词</p>
        ${room.knowledge.map(k => `<details><summary>${esc(k.term)}</summary><p>${esc(k.text)}</p></details>`).join('')}
      </div>`);
    }
    if (room.notes && room.notes.length) {
      parts.push(`<details class="threshold-notes">
        <summary>单元补遗与背景（${room.notes.length} 则）</summary>
        <div>${room.notes.map(n => `<p>${esc(n)}</p>`).join('')}</div>
      </details>`);
    }
    return parts.join('');
  }

  function showThresholdPanel(index) {
    const room = DATA.rooms[index];
    const hall = HALL_BY_ID[room.hall];
    state.overlay = 'threshold';
    $('#threshold').dataset.hall = hall.id;
    $('#threshold').hidden = false;
    $('#thresholdBg').src = room.exhibits[0] ? room.exhibits[0].hero.src : hall.hero;
    $('#thresholdKicker').textContent = `${hall.name} · ${room.chapter}`;
    $('#thresholdTitle').textContent = room.title;
    $('#thresholdSub').textContent = room.subtitle;
    $('#thresholdIntro').innerHTML = room.intro.map(p => `<p>${esc(p)}</p>`).join('') + knowledgeHtml(room);
    $$('[data-wiki]', $('#thresholdIntro')).forEach(btn => {
      btn.addEventListener('click', () => openWikiEntry(btn.dataset.wiki, 'threshold'));
    });
    $('#thresholdPanel').scrollTop = 0;
    $('#threshold').scrollTop = 0;
  }

  function skipThreshold() {
    $('#threshold').hidden = true;
    if (state.overlay === 'threshold') state.overlay = null;
    if (window.innerWidth < 720 && !mobileHintShown) {
      mobileHintShown = true;
      setTimeout(() => toast('左右拖动浏览展墙 · 点击文物查看详情'), 450);
    }
  }

  /* ---------- 详情 ---------- */
  function openDetail(ri, ei, imgIndex = 0, from = 'gallery') {
    const room = DATA.rooms[ri];
    const ex = room.exhibits[ei];
    if (!ex) return;
    hideToast();
    closeTagWiki();
    state.detail = { ri, ei, imgIndex };
    state.detailFrom = from;
    state.overlay = 'detail';
    $('#detail').hidden = false;
    $('#detailCloseBtn').innerHTML = from === 'catalog' ? '← <span>返回目录</span>'
      : from === 'map' ? '← <span>返回地图</span>'
      : from === 'timeline' ? '← <span>返回时间轴</span>'
      : from === 'filter' ? '← <span>返回筛选</span>'
      : from === 'wiki' ? '← <span>返回词条</span>' : '← <span>返回展厅</span>';
    renderDetail();
    markVisited(ex.id);
  }

  function renderDetail() {
    if (!state.detail) return;
    const { ri, ei, imgIndex } = state.detail;
    const room = DATA.rooms[ri];
    const ex = room.exhibits[ei];
    const item = EX_BY_ID[ex.id];
    const hall = HALL_BY_ID[room.hall];

    $('#detailKicker').textContent = `${hall.name} · ${room.title}`;
    $('#detailName').textContent = ex.name;
    $('#detailArtist').textContent = periodText(ex);
    $('#detailMeta').textContent = [ex.period, ex.category].filter(Boolean).join(' · ') || '展品';
    $('#detailCounter').textContent = `第 ${item.global} 组 / 共 ${DATA.meta.total} 组`;
    $('#detailBody').innerHTML = ex.intro.length
      ? ex.intro.map(p => `<p>${esc(p)}</p>`).join('')
      : '<p>本组展项暂无单独说明，可参考同单元其他文物与单元导览。</p>';

    const foot = $('#detailFoot');
    const wlinks = relatedWikiForEx(ex, room);
    foot.hidden = false;
    foot.innerHTML = `
      ${wlinks.length ? `<div class="detail-wiki">
        <p class="dw-title">延伸阅读 · 相关词条</p>
        <div class="dw-list">
          ${wlinks.map(w => `<button type="button" class="dw-link" data-wiki="${esc(w.id)}"><span class="dw-type">${wikiTypeLabel(w.type)}</span><b>${esc(w.title)}</b><span class="dw-arrow">→</span></button>`).join('')}
        </div>
      </div>` : ''}
      ${room.sourceUrl ? `<a class="detail-link" href="${esc(room.sourceUrl)}" target="_blank" rel="noopener"><span>原文 · ${esc(room.sourceTitle.replace(/——.*$/, ''))}</span><span>↗</span></a>` : ''}`;
    $$('[data-wiki]', foot).forEach(btn => {
      btn.addEventListener('click', () => openWikiEntry(btn.dataset.wiki, 'detail'));
    });

    $('#detailPrevBtn').disabled = item.global <= 1;
    $('#detailNextBtn').disabled = item.global >= FLAT.length;
    $('#detailPanel').scrollTop = 0;

    renderTags(ex);
    renderGraph(ex, ri);
    renderViewer(ex, imgIndex);
  }

  /* ---------- 标签 ---------- */
  const TAG_KIND_LABEL = { civ: '帝国', place: '地点', category: '类别', period: '时期' };

  function tagWikiText(name) {
    const entry = DATA.wiki && DATA.wiki[name];
    if (entry && entry.text) return entry.text;
    return `“${name}”是本展用于整理展品的索引标签。`;
  }

  function renderTags(ex) {
    const wrap = $('#detailTags');
    const tags = ex.tags || [];
    if (!tags.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `
      <div class="dt-head"><span>帝国 · 地点 · 类别</span><small>点击标签查看百科</small></div>
      <div class="tag-list">${tags.map(t => `<button type="button" class="tag-chip ${esc(t.kind)}" data-tag="${esc(t.name)}" data-kind="${esc(t.kind)}" title="点击查看「${esc(t.name)}」百科">${esc(t.name)}</button>`).join('')}</div>`;
  }

  function openTagWiki(name, kind) {
    if (!name) return;
    const currentId = state.detail ? DATA.rooms[state.detail.ri].exhibits[state.detail.ei].id : '';
    const allRelated = FLAT.filter(f => f.ex.id !== currentId && (f.ex.tags || []).some(t => t.name === name));
    const related = allRelated.slice(0, 8);
    let wikiId = '';
    if (kind === 'civ') {
      const civ = DATA.civs.find(c => c.name === name);
      if (civ) wikiId = 'civ-' + civ.id;
    } else if (kind === 'place') {
      const place = DATA.places.find(p => p.name === name);
      const site = place && WIKI.find(w => w.type === 'site' && w.placeId === place.id);
      if (site) wikiId = site.id;
    }
    $('#twTitle').textContent = name;
    $('#twKind').textContent = TAG_KIND_LABEL[kind] || '';
    $('#twBody').innerHTML = `<p>${esc(tagWikiText(name))}</p>${wikiId ? `<button type="button" class="ghost-btn tw-wiki-open" data-wiki="${esc(wikiId)}">查看完整词条 →</button>` : ''}`;
    $$('[data-wiki]', $('#twBody')).forEach(btn => {
      btn.addEventListener('click', () => {
        closeTagWiki();
        const from = !$('#wikiReader').hidden ? state.wikiReturn : (state.detail ? 'detail' : 'list');
        openWikiEntry(btn.dataset.wiki, from);
      });
    });
    $('#twWorks').innerHTML = related.length
      ? related.map(f => `<button type="button" class="tw-work" data-id="${esc(f.ex.id)}">${esc(f.ex.name)}<small>${esc(f.room.title)} · ${esc(placeOf(f.ex).name)}</small></button>`).join('')
      : '<p class="tw-empty">暂无其他相关展品。</p>';
    if (allRelated.length > related.length) {
      $('#twWorks').insertAdjacentHTML('beforeend', `<p class="tw-empty">共 ${allRelated.length} 组相关展品，展示前 ${related.length} 组。</p>`);
    }
    $$('.tw-work', $('#twWorks')).forEach(btn => {
      btn.addEventListener('click', () => {
        const item = EX_BY_ID[btn.dataset.id];
        closeTagWiki();
        if (item) openDetail(item.ri, item.ei, 0, state.detailFrom);
      });
    });
    $('#tagWiki').hidden = false;
    $('#twCloseBtn').focus();
  }

  function closeTagWiki() { $('#tagWiki').hidden = true; }

  /* ---------- 关联图 ---------- */
  function shortName(name) {
    let s = String(name || '').replace(/[（(].*?[）)]/g, '');
    s = s.replace(/[，,、].*$/, '');
    return s.slice(0, 5) || String(name || '').slice(0, 3);
  }

  function getRelated(ex, ri) {
    const civ = ex.civId;
    const place = ex.placeId;
    const cat = ex.category;
    return FLAT.filter(f => f.ex.id !== ex.id).map(f => {
      let score = 0;
      const kinds = [];
      const reasons = [];
      if (f.ex.civId === civ) { score += 4; kinds.push('civ'); reasons.push('同一帝国'); }
      if (f.ex.placeId === place) { score += 3; kinds.push('place'); reasons.push('同地点'); }
      if (f.ex.category === cat) { score += 2; kinds.push('category'); reasons.push('同类别'); }
      if (f.ri === ri) score += 0.8;
      const kind = kinds.includes('civ') ? 'civ' : kinds.includes('place') ? 'place' : kinds.includes('category') ? 'category' : 'room';
      return { item: f, score, kind, reasons };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 7);
  }

  function renderGraph(ex, ri) {
    const wrap = $('#detailGraph');
    const related = getRelated(ex, ri);
    if (!related.length) {
      wrap.innerHTML = '<div class="dg-head"><span>同类文物 · 关联图</span></div><p class="dg-empty">暂无足够关联的展品。</p>';
      return;
    }
    const cx = 180, cy = 148, radius = 102;
    const positions = related.map((r, i) => {
      const a = -Math.PI / 2 + i * (2 * Math.PI / related.length);
      return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
    });
    const edges = related.map((r, i) => `<line class="rel-edge ${r.kind}" x1="${cx}" y1="${cy}" x2="${positions[i].x.toFixed(1)}" y2="${positions[i].y.toFixed(1)}"/>`).join('');
    const nodes = related.map((r, i) => {
      const p = positions[i];
      const reason = r.reasons.length ? r.reasons.join('、') : '同单元';
      return `<g class="rel-node ${r.kind}" data-id="${esc(r.item.ex.id)}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">
        <circle r="21"></circle>
        <text y="4">${esc(shortName(r.item.ex.name))}</text>
        <title>${esc(r.item.ex.name)} · ${esc(reason)}</title>
      </g>`;
    }).join('');
    wrap.innerHTML = `
      <div class="dg-head"><span>同类文物 · 关联图</span><small>点击节点切换</small></div>
      <svg class="rel-graph" viewBox="0 0 360 300" role="img" aria-label="文物关系图">
        ${edges}${nodes}
        <g class="rel-center" transform="translate(${cx},${cy})">
          <circle r="30"></circle>
          <text y="4">${esc(shortName(ex.name))}</text>
          <title>${esc(ex.name)}</title>
        </g>
      </svg>
      <div class="dg-legend">
        <span><i class="artist"></i>同一帝国</span>
        <span><i class="style"></i>同地点</span>
        <span><i class="subject"></i>同类别</span>
        <span><i class="room"></i>同单元</span>
      </div>`;
    $$('.rel-node', wrap).forEach(g => {
      g.addEventListener('click', () => {
        const item = EX_BY_ID[g.dataset.id];
        if (item) openDetail(item.ri, item.ei, 0, state.detailFrom);
      });
    });
  }

  /* ---------- 图片查看器 ---------- */
  function setViewerFullscreen(on, quiet = false) {
    const v = state.viewer;
    const should = !!on && isMobileLayout();
    if (should === v.fullscreen) return;
    v.fullscreen = should;
    $('#detail').classList.toggle('viewer-max', should);
    $('#viewerFullBtn').setAttribute('aria-pressed', should ? 'true' : 'false');
    if (!state.detail) return;
    requestAnimationFrame(() => fitViewer('all'));
    if (!quiet) toast(should ? '全屏查看 · 拖动浏览，双指缩放' : '已退出全屏');
  }

  function renderViewer(ex, imgIndex) {
    const im = ex.images[imgIndex] || ex.hero;
    const v = state.viewer;
    v.natW = im.w || 1000;
    v.natH = im.h || 1000;
    const img = $('#viewerImg');
    img.onerror = null;
    img.referrerPolicy = 'no-referrer';
    img.src = im.full;
    img.alt = `${ex.name} · 图${imgIndex + 1}`;
    img.onerror = () => {
      if (img.dataset.fallback !== '1') {
        img.dataset.fallback = '1';
        img.src = im.src;
      }
    };
    img.dataset.fallback = '';
    fitViewer('all');
    const cap = im.caption && im.caption !== ex.name ? im.caption : '';
    $('#detailCaption').textContent = cap;
    $('#detailCaption').hidden = !cap;
    renderThumbs(ex, imgIndex);
  }

  function renderThumbs(ex, active) {
    const wrap = $('#viewerThumbs');
    wrap.innerHTML = '';
    if (ex.images.length <= 1) return;
    const buttons = ex.images.map((im, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vthumb' + (i === active ? ' active' : '');
      b.title = im.caption || `${ex.name} · 图${i + 1}`;
      b.innerHTML = `<img referrerpolicy="no-referrer" src="${esc(im.src)}" alt="${esc(im.caption || '')}">`;
      b.addEventListener('click', () => {
        if (!state.detail) return;
        state.detail.imgIndex = i;
        const ex2 = DATA.rooms[state.detail.ri].exhibits[state.detail.ei];
        renderViewer(ex2, i);
      });
      wrap.appendChild(b);
      return b;
    });
    const current = buttons[active];
    if (current) requestAnimationFrame(() => current.scrollIntoView({ block: 'nearest', inline: 'center' }));
  }

  function fitViewer(mode) {
    const v = state.viewer;
    const stage = $('#viewerStage');
    const sw = stage.clientWidth || 800;
    const sh = stage.clientHeight || 500;
    const s = Math.min((sw - 60) / v.natW, (sh - 74) / v.natH);
    v.fit = Math.max(s, 0.0001);
    v.scale = 1;
    v.mode = mode;
    v.x = 0;
    v.y = 0;
    applyViewer();
  }

  function applyViewer() {
    const v = state.viewer;
    const img = $('#viewerImg');
    const art = $('#viewerArt');
    const vw = v.natW * v.fit * v.scale;
    const vh = v.natH * v.fit * v.scale;
    art.style.width = `${vw}px`;
    art.style.height = `${vh}px`;
    img.style.width = `${v.natW * v.fit * v.scale}px`;
    img.style.height = `${v.natH * v.fit * v.scale}px`;
    img.style.transform = 'translate(-50%, -50%)';
    art.style.transform = `translate(${v.x}px, ${v.y}px)`;
    updateScrollbar(vw, vh);
  }

  function updateScrollbar(vw, vh) {
    const bar = $('#viewerScrollbar');
    const thumb = bar.firstElementChild;
    const stage = $('#viewerStage');
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    if (vw > sw + 4) {
      bar.className = 'viewer-scrollbar horizontal show';
      const tw = clamp((sw / vw) * 100, 8, 100);
      const maxX = (vw - sw) / 2 + 20;
      const ratio = maxX > 0 ? clamp((maxX - state.viewer.x) / (2 * maxX), 0, 1) : 0;
      thumb.style.width = `${tw}%`;
      thumb.style.height = '100%';
      thumb.style.left = `${ratio * (100 - tw)}%`;
      thumb.style.top = '0';
    } else if (vh > sh + 4) {
      bar.className = 'viewer-scrollbar vertical show';
      const th = clamp((sh / vh) * 100, 8, 100);
      const maxY = (vh - sh) / 2 + 20;
      const ratio = maxY > 0 ? clamp((maxY - state.viewer.y) / (2 * maxY), 0, 1) : 0;
      thumb.style.height = `${th}%`;
      thumb.style.width = '100%';
      thumb.style.top = `${ratio * (100 - th)}%`;
      thumb.style.left = '0';
    } else {
      bar.className = 'viewer-scrollbar';
    }
  }

  function clampViewer() {
    const v = state.viewer;
    const stage = $('#viewerStage');
    const vw = v.natW * v.fit * v.scale;
    const vh = v.natH * v.fit * v.scale;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const maxX = vw > sw ? (vw - sw) / 2 + 20 : 0;
    const maxY = vh > sh ? (vh - sh) / 2 + 20 : 0;
    v.x = clamp(v.x, -maxX, maxX);
    v.y = clamp(v.y, -maxY, maxY);
  }

  function zoomViewer(factor) {
    const v = state.viewer;
    const next = clamp(v.scale * factor, 1, 12);
    if (Math.abs(next - v.scale) < 0.001) return;
    v.scale = next;
    clampViewer();
    applyViewer();
  }

  function stepDetail(dir) {
    if (!state.detail) return;
    const item = EX_BY_ID[DATA.rooms[state.detail.ri].exhibits[state.detail.ei].id];
    const next = FLAT[item.global - 1 + dir];
    if (!next) return;
    if (next.ri !== state.detail.ri) enterRoom(next.ri, false);
    state.detail = { ri: next.ri, ei: next.ei, imgIndex: 0 };
    renderDetail();
    markVisited(next.ex.id);
  }

  function closeDetail() {
    setViewerFullscreen(false, true);
    state.viewer.pointers.clear();
    state.viewer.pinch = null;
    state.viewer.dragging = false;
    closeTagWiki();
    $('#detail').hidden = true;
    state.detail = null;
    if (state.overlay === 'detail') state.overlay = null;
    const from = state.detailFrom;
    if (from === 'catalog') openCatalog();
    else if (from === 'filter') { showFilterScreen(); }
    else if (from === 'map') { showMapScreen(); }
    else if (from === 'wiki' && state.wikiEntry) { $('#wikiReader').hidden = false; }
    else if (from === 'timeline') { $('#gallery').hidden = true; showTimelineScreen('home'); }
  }

  /* ---------- 目录 ---------- */
  function renderCatalogFilters() {
    const wrap = $('#catalogFilters');
    wrap.innerHTML = '';
    const items = [{ key: 'all', label: `全部 ${DATA.meta.total}` }].concat(
      DATA.halls.map(h => ({ key: h.id, label: `${h.no} ${h.name} · ${h.exhibitCount}` }))
    );
    items.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'filter-chip' + (state.catalogFilter === it.key ? ' active' : '');
      b.textContent = it.label;
      b.addEventListener('click', () => {
        state.catalogFilter = it.key;
        renderCatalogFilters();
        renderCatalog();
      });
      wrap.appendChild(b);
    });
  }

  function renderCatalog() {
    const grid = $('#catalogGrid');
    const q = state.catalogQuery.trim().toLowerCase();
    const items = FLAT.filter(item => {
      if (state.catalogFilter !== 'all' && item.room.hall !== state.catalogFilter) return false;
      if (!q) return true;
      const hay = `${item.ex.name} ${civOf(item.ex).name} ${placeOf(item.ex).name} ${item.ex.period} ${item.ex.category} ${item.room.title}`.toLowerCase();
      return hay.includes(q);
    });
    if (!items.length) {
      grid.innerHTML = '<div class="catalog-empty">没有找到匹配的展品，试试其他关键词。</div>';
      return;
    }
    grid.innerHTML = items.map(item => `
      <article class="cat-card${state.visited.has(item.ex.id) ? ' visited' : ''}" data-id="${esc(item.ex.id)}" tabindex="0" role="button" aria-label="${esc(item.ex.name)}">
        <div class="cat-img">
          <img loading="lazy" referrerpolicy="no-referrer" src="${esc(item.ex.hero.src)}" alt="">
          <span class="cat-no">${pad2(item.global)}</span>
        </div>
        <p class="cat-name">${esc(item.ex.name)}</p>
        <div class="cat-meta">${esc(civOf(item.ex).name)} · ${esc(placeOf(item.ex).name)}</div>
        <div class="cat-room">${esc(item.room.title)}</div>
      </article>`).join('');
  }

  function openCatalog() {
    hideToast();
    state.catalogScroll = $('#catalog').scrollTop;
    state.overlay = 'catalog';
    $('#catalog').hidden = false;
    renderCatalogFilters();
    renderCatalog();
    $('#catalog').scrollTop = state.catalogScroll;
  }
  function closeCatalog() {
    state.catalogScroll = $('#catalog').scrollTop;
    $('#catalog').hidden = true;
    if (state.overlay === 'catalog') state.overlay = null;
  }

  /* ---------- 指南 ---------- */
  function openGuide() {
    hideToast();
    state.overlay = 'guide';
    const overview = DATA.meta.overview || [];
    $('#guideOverview').innerHTML = overview.length
      ? `<summary>展览总览与导言（${overview.length} 则）</summary><div>${overview.map(p => `<p>${esc(p)}</p>`).join('')}</div>`
      : '';
    $('#guide').hidden = false;
  }
  function closeGuide() {
    $('#guide').hidden = true;
    if (state.overlay === 'guide') state.overlay = null;
  }

  /* ---------- 词条 ---------- */
  function qualityTag(im) {
    return im && im.quality === 'low' ? '<span class="wiki-quality">资料图</span>' : '';
  }
  function wikiTypeLabel(type) { return WIKI_TYPE_LABEL[type] || '词条'; }
  function wikiCivOf(w) { return w.civId ? CIV_BY_ID[w.civId] : null; }
  function wikiPlaceOf(w) { return w.placeId ? PLACE_BY_ID[w.placeId] : null; }
  function wikiSearchText(w) {
    return `${w.title} ${w.summary} ${(w.paragraphs || []).join(' ')} ${(wikiCivOf(w) || {}).name || ''} ${(wikiPlaceOf(w) || {}).name || ''}`.toLowerCase();
  }

  function showWikiScreen(from = 'home') {
    hideToast();
    state.wikiFrom = from;
    state.wikiReturn = from;
    if (from === 'home' || from === 'gallery') state.subReturn = from;
    state.overlay = 'wiki';
    $('#intro').hidden = true;
    $('#gallery').hidden = true;
    $('#mapScreen').hidden = true;
    $('#filterScreen').hidden = true;
    $('#timelineScreen').hidden = true;
    $('#wikiScreen').hidden = false;
    document.body.classList.remove('at-home');
    document.body.classList.remove('in-gallery');
    renderWikiTabs();
    renderWikiGrid();
    $('#wikiScreen').scrollTop = state.wiki.scroll || 0;
  }

  function renderWikiTabs() {
    const types = DATA.wikiTypes || [
      { key: 'all', label: '全部词条' }, { key: 'civ', label: '文明' }, { key: 'topic', label: '专题' }
    ];
    const counts = { all: WIKI.length };
    WIKI.forEach(w => { counts[w.type] = (counts[w.type] || 0) + 1; });
    $('#wikiTabs').innerHTML = types.map(t => `
      <button type="button" class="wiki-tab${state.wiki.type === t.key ? ' active' : ''}" data-type="${t.key}">
        ${esc(t.label)}<small>${counts[t.key] || 0}</small>
      </button>`).join('');
    $$('.wiki-tab', $('#wikiTabs')).forEach(btn => {
      btn.addEventListener('click', () => {
        state.wiki.type = btn.dataset.type;
        renderWikiTabs();
        renderWikiGrid();
        $('#wikiScreen').scrollTop = 0;
      });
    });
  }

  function renderWikiGrid() {
    const grid = $('#wikiGrid');
    const q = state.wiki.query.trim().toLowerCase();
    const items = WIKI.filter(w => {
      if (state.wiki.type !== 'all' && w.type !== state.wiki.type) return false;
      return !q || wikiSearchText(w).includes(q);
    });
    if (!items.length) {
      grid.innerHTML = '<p class="catalog-empty">没有找到匹配的词条，试试其他关键词。</p>';
      return;
    }
    const order = { civ: 0, site: 1, topic: 2 };
    items.sort((a, b) => (order[a.type] - order[b.type]) || a.title.localeCompare(b.title, 'zh-Hans-CN'));
    grid.innerHTML = items.map(w => {
      const hero = (w.images || [])[0];
      const civ = wikiCivOf(w);
      return `
      <article class="wiki-card" data-id="${esc(w.id)}" tabindex="0" role="button" style="--wc-color:${civ ? civ.color : '#c6a76a'}">
        <div class="wc-img">${hero ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(hero.src)}" alt="${esc(w.title)}">${qualityTag(hero)}` : `<span class="wc-letter">${esc(w.title.slice(0, 1))}</span>`}</div>
        <div class="wc-body">
          <span class="wc-type">${wikiTypeLabel(w.type)}</span>
          <h3>${esc(w.title)}</h3>
          <p>${esc(w.summary || '')}</p>
          <small>${esc(w.era || '')}${w.images && w.images.length ? ` · ${w.images.length} 幅图像` : ''}${w.artifactIds && w.artifactIds.length ? ` · ${w.artifactIds.length} 组展项` : ''}</small>
        </div>
      </article>`;
    }).join('');
    $$('.wiki-card', grid).forEach(card => {
      const go = () => openWikiEntry(card.dataset.id, 'list');
      card.addEventListener('click', go);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
  }

  function openWikiEntry(id, from = 'list') {
    const w = WIKI_BY_ID[id];
    if (!w) return;
    state.wikiEntry = id;
    state.wikiReturn = from;
    state.overlay = 'wiki-reader';
    renderWikiReader(w);
    $('#wikiReader').hidden = false;
    $('#wikiReaderBody').scrollTop = 0;
  }

  function renderWikiReader(w) {
    const civ = wikiCivOf(w);
    const place = wikiPlaceOf(w);
    const hero = (w.images || [])[0];
    const firstPara = ((w.paragraphs || [])[0] || '').replace(/\s+/g, '');
    const summaryKey = String(w.summary || '').replace(/\s+/g, '').replace(/…$/, '').slice(0, 16);
    const showSummary = !!w.summary && !(summaryKey && firstPara.startsWith(summaryKey));
    const backLabel = state.wikiReturn === 'detail' ? '返回文物'
      : state.wikiReturn === 'map' ? '返回地图'
        : state.wikiReturn === 'threshold' ? '返回单元'
          : state.wikiReturn === 'gallery' ? '返回展厅' : '返回词条列表';
    $('#wikiReaderBack').innerHTML = `← <span>${backLabel}</span>`;
    $('#wikiReaderType').textContent = `${wikiTypeLabel(w.type)} · 延伸阅读`;
    const artifacts = (w.artifactIds || []).map(id => EX_BY_ID[id]).filter(Boolean);
    const related = (w.related || []).map(id => WIKI_BY_ID[id]).filter(Boolean).slice(0, 8);
    const paragraphs = w.paragraphs || [];
    const imgList = w.images || [];
    const candidates = imgList.map((im, i) => ({ im, i })).filter(x => x.i !== 0);
    const capWords = s => (String(s || '').match(/[\u4e00-\u9fa5]{2,6}/g) || []);
    const entryText = `${w.title} ${w.summary || ''} ${(w.paragraphs || []).join('')}`;
    const GENERIC_KEYS = /^(莫卧儿时期|16世纪|17世纪|18世纪|19世纪|15世纪|16—17世纪|17—18世纪|18—19世纪|文化|文明|时期|帝国|王朝|艺术|工艺)$/;
    const topicKeys = (Array.isArray(w.keywords) && w.keywords.length ? w.keywords : [w.title])
      .filter(k => k && k.length >= 2 && !GENERIC_KEYS.test(k));
    const capMatchesEntry = cap => {
      if (!cap) return false;
      if (topicKeys.some(k => cap.includes(k))) return true;
      if (w.type === 'topic') return false;
      return capWords(cap).filter(x => x.length >= 3).some(x => entryText.includes(x));
    };
    const imageRelevant = c => {
      const im = c.im;
      const cap = String(im.caption || '');
      const art = im.artifactId ? EX_BY_ID[im.artifactId] : null;
      if (art) {
        if (w.type === 'civ' && w.civId && art.ex.civId === w.civId) return true;
        if (w.placeId && art.ex.placeId === w.placeId) return true;
        if (w.type !== 'site' && topicKeys.some(k => art.ex.name.includes(k) || cap.includes(k))) return true;
      }
      if (w.type === 'site') {
        const base = w.title.replace(/(墓|遗址|古城|神庙|金字塔|王陵)$/, '');
        const names = [w.title, base].concat(w.title.split(/[与、·—]/)).filter(x => x && x.length >= 2);
        return names.some(t => cap.includes(t));
      }
      return capMatchesEntry(cap);
    };
    const textPanel = c => {
      const cap = String(c.im.caption || '');
      return cap.length > 40 || /(价值|意义|崛起|发达|使用|主要|记录|展示|体现|说明|通过|面对|其中|观念|记载|本次展览|专题|分为|相对独立|被称为|这种雕像)/.test(cap);
    };
    const visualCandidates = candidates.filter(c => imageRelevant(c) && !textPanel(c));
    const pickPool = visualCandidates;
    const imgScore = (im, p) => {
      let sc = 0;
      capWords(im.caption).forEach(w => { if (p.includes(w)) sc += w.length >= 3 ? 2 : 1; });
      if (!sc && im.artifactId) {
        const it = EX_BY_ID[im.artifactId];
        if (it && p.includes(it.ex.name.slice(0, 4))) sc += 2;
      }
      const cap = String(im.caption || '');
      let visual = im.artifactId ? 3 : 0;
      if (im.quality !== 'low') visual += 2;
      if (/(遗址|地图|复原|全景|出土|墓葬|神庙|金字塔|壁画|雕像|陶瓶|陶器|金|银|石|玉|面具|香炉|球场|城市|宫殿|器物|图像|照片)/.test(cap)) visual += 2;
      if (/(价值|意义|崛起|发达|使用|主要|最后|记录|展示|体现|说明|通过|面对|其中|观念|记载|体现)/.test(cap)) visual -= 3;
      if (cap.length <= 8) visual -= 2;
      return sc * 2 + visual;
    };
    const usedIdx = new Set();
    const usedArtifacts = new Set();
    const usedCaps = new Set();
    const paraFig = new Map();
    const totalChars = paragraphs.join('').length;
    const maxInline = Math.min(6, Math.max(3, Math.round(totalChars / 200), Math.round(paragraphs.length / 1.5)));
    const targetCount = paragraphs.length ? Math.min(maxInline, pickPool.length) : 0;
    const targetParas = [];
    for (let j = 0; j < targetCount; j++) {
      const pi = Math.floor(((j + 1) * paragraphs.length) / (targetCount + 1));
      if (!targetParas.includes(pi)) targetParas.push(pi);
    }
    targetParas.forEach(pi => {
      let best = null, bestScore = -Infinity;
      pickPool.forEach(c => {
        if (usedIdx.has(c.i)) return;
        if (c.im.artifactId && usedArtifacts.has(c.im.artifactId)) return;
        const capCore = String(c.im.caption || '').replace(/[（(].*$/, '').trim();
        if (capCore && usedCaps.has(capCore)) return;
        const sc = imgScore(c.im, paragraphs[pi]);
        if (sc > bestScore) { bestScore = sc; best = c; }
      });
      if (best) {
        usedIdx.add(best.i);
        if (best.im.artifactId) usedArtifacts.add(best.im.artifactId);
        const capCore = String(best.im.caption || '').replace(/[（(].*$/, '').trim();
        if (capCore) usedCaps.add(capCore);
        paraFig.set(pi, best);
      }
    });
    let figNo = 0;
    const figureHtml = c => {
      if (!c) return '';
      figNo += 1;
      const im = c.im;
      return `<figure class="wr-inline-fig">
        <button type="button" data-light="${c.i}" title="点击全屏观看">
          <img loading="lazy" referrerpolicy="no-referrer" src="${esc(im.src)}" alt="${esc(im.caption || w.title)}">
          ${qualityTag(im)}
        </button>
        <figcaption><b>图 ${figNo}</b> ${esc(im.caption || w.title)}</figcaption>
      </figure>`;
    };
    const textHtml = paragraphs.map((p, i) => `<p>${esc(p)}</p>${figureHtml(paraFig.get(i))}`).join('');
    const restImages = imgList.map((im, i) => ({ im, i })).filter(x => x.i !== 0 && !usedIdx.has(x.i));
    const artHeading = w.artifactScope === 'civ' ? '同帝国展项' : '相关展项';
    $('#wikiReaderBody').innerHTML = `
      <article class="wr-article">
        <header class="wr-head">
          ${hero ? `<button class="wr-hero" type="button" data-light="0" title="点击全屏观看">
            <img referrerpolicy="no-referrer" src="${esc(hero.src)}" alt="${esc(w.title)}">
            ${qualityTag(hero)}
            <span class="wr-hero-hint">点击全屏观看</span>
          </button>` : ''}
          <div class="wr-title-wrap">
            <p class="wr-kicker">${wikiTypeLabel(w.type)}${w.era ? ' · ' + esc(w.era) : ''}</p>
            <h1>${esc(w.title)}</h1>
            ${showSummary ? `<p class="wr-summary">${esc(w.summary)}</p>` : ''}
            <div class="wr-tags">
              ${civ ? `<button type="button" class="tag-chip civ" data-wiki-civ="${civ.id}">${esc(civ.name)}</button>` : ''}
              ${place ? `<button type="button" class="tag-chip place" data-tag-place="${esc(place.name)}">${esc(place.name)}</button>` : ''}
            </div>
          </div>
        </header>
        <div class="wr-text">${textHtml}</div>
        ${restImages.length ? `
        <section class="wr-gallery">
          <div class="wr-sec-head"><h2>更多图像</h2><span>${restImages.length} 幅 · 低清图像标注“资料图”</span></div>
          <div class="wr-img-grid">
            ${restImages.map(({ im, i }) => `
              <button type="button" class="wr-img" data-light="${i}">
                <img loading="lazy" referrerpolicy="no-referrer" src="${esc(im.src)}" alt="${esc(im.caption || w.title)}">
                ${qualityTag(im)}
                <span>${esc(im.caption || w.title)}</span>
              </button>`).join('')}
          </div>
        </section>` : ''}
        ${artifacts.length ? `
        <section class="wr-artifacts">
          <div class="wr-sec-head"><h2>${artHeading}</h2><span>点击进入文物详情</span></div>
          <div class="wr-art-grid">
            ${artifacts.slice(0, 12).map(item => `
              <button type="button" class="wr-art" data-art="${esc(item.ex.id)}">
                <span class="wr-art-img"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(item.ex.hero.src)}" alt=""></span>
                <span class="wr-art-name">${esc(item.ex.name)}</span>
                <small>${esc(civOf(item.ex).name)} · ${esc(placeOf(item.ex).name)} · ${esc(item.ex.period || '')}</small>
              </button>`).join('')}
          </div>
        </section>` : ''}
        ${related.length ? `
        <section class="wr-related">
          <div class="wr-sec-head"><h2>相关词条</h2><span>可以继续延伸阅读</span></div>
          <div class="wr-rel-list">
            ${related.map(r => `<button type="button" class="wr-rel" data-wiki="${esc(r.id)}"><b>${esc(r.title)}</b><small>${wikiTypeLabel(r.type)} · ${esc(r.summary || '').slice(0, 46)}</small></button>`).join('')}
          </div>
        </section>` : ''}
        ${w.source && w.source.url ? `<p class="wr-source">据公众号「獭的游乐场」<a href="${esc(w.source.url)}" target="_blank" rel="noopener">${esc(String(w.source.title || '').replace(/——.*$/, ''))} ↗</a> 及常见伊斯兰艺术史资料整理。</p>` : '<p class="wr-source">据公众号「獭的游乐场」系列文章及常见伊斯兰艺术史资料整理。</p>'}
      </article>`;
    $$('[data-light]', $('#wikiReaderBody')).forEach(btn => {
      btn.addEventListener('click', () => openWikiLightbox(+btn.dataset.light));
    });
    $$('[data-art]', $('#wikiReaderBody')).forEach(btn => {
      btn.addEventListener('click', () => openWikiArtifact(btn.dataset.art));
    });
    $$('[data-wiki]', $('#wikiReaderBody')).forEach(btn => {
      btn.addEventListener('click', () => openWikiEntry(btn.dataset.wiki, state.wikiReturn || 'list'));
    });
    const civBtn = $('[data-wiki-civ]', $('#wikiReaderBody'));
    if (civBtn) civBtn.addEventListener('click', () => openWikiEntry('civ-' + civBtn.dataset.wikiCiv, state.wikiReturn || 'list'));
    const placeBtn = $('[data-tag-place]', $('#wikiReaderBody'));
    if (placeBtn) placeBtn.addEventListener('click', () => openTagWiki(placeBtn.dataset.tagPlace, 'place'));
  }

  function closeWikiReader() {
    $('#wikiReader').hidden = true;
    state.wikiEntry = null;
    if (state.wikiReturn === 'detail') state.overlay = 'detail';
    else if (state.wikiReturn === 'threshold') state.overlay = 'threshold';
    else if (state.wikiReturn === 'map') state.overlay = 'map';
    else if (state.wikiReturn === 'gallery') state.overlay = null;
    else state.overlay = 'wiki';
    if (state.wikiReturn === 'list') {
      state.wiki.scroll = $('#wikiScreen').scrollTop;
      $('#wikiScreen').hidden = false;
    }
  }

  function openWikiArtifact(id) {
    const item = EX_BY_ID[id];
    if (!item) return;
    $('#wikiReader').hidden = true;
    startGallery();
    enterRoom(item.ri, false, 'start');
    openDetail(item.ri, item.ei, 0, 'wiki');
  }

  function wikiLightApply() {
    const st = state.wikiLight;
    const img = $('#wikiLightboxImg');
    img.style.transform = `translate(${st.x}px, ${st.y}px) scale(${st.scale})`;
    img.style.cursor = st.scale > 1 ? (st.dragging ? 'grabbing' : 'grab') : 'zoom-in';
    img.style.transition = st.dragging ? 'none' : '';
  }
  function resetWikiLight() {
    const st = state.wikiLight;
    st.scale = 1;
    st.x = 0;
    st.y = 0;
    st.dragging = false;
    wikiLightApply();
  }

  function openWikiLightbox(index) {
    const w = WIKI_BY_ID[state.wikiEntry];
    if (!w || !w.images || !w.images.length) return;
    const i = clamp(index, 0, w.images.length - 1);
    state.wikiLight.index = i;
    const im = w.images[i];
    const img = $('#wikiLightboxImg');
    img.dataset.fallback = '';
    img.onerror = () => { if (img.dataset.fallback !== '1') { img.dataset.fallback = '1'; img.src = im.src; } };
    img.src = im.full || im.src;
    img.alt = `${w.title} · ${im.caption || ''}`;
    $('#wikiLightboxCap').innerHTML = `${esc(w.title)}${im.caption ? ' · ' + esc(im.caption) : ''}${im.quality === 'low' ? ' <b class="wq">资料图</b>' : ''} <small>${i + 1} / ${w.images.length}</small> <a class="wl-orig" href="${esc(im.full || im.src)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">查看原图 ↗</a> <small class="wl-zoom">滚轮缩放 · 拖动查看</small>`;
    $('#wikiLightbox').hidden = false;
    resetWikiLight();
  }

  function closeWikiLightbox() {
    $('#wikiLightbox').hidden = true;
    $('#wikiLightboxImg').src = '';
  }

  function stepWikiLightbox(dir) {
    const w = WIKI_BY_ID[state.wikiEntry];
    if (!w) return;
    openWikiLightbox((state.wikiLight.index + dir + w.images.length) % w.images.length);
  }

  function relatedWikiForEx(ex, room) {
    const out = [];
    WIKI.forEach(w => {
      if (out.length >= 6) return;
      const isSite = w.type === 'site' && (w.artifactIds || []).includes(ex.id);
      const isTopic = w.type === 'topic' && (w.artifactIds || []).includes(ex.id);
      const isCiv = w.type === 'civ' && w.civId === ex.civId;
      const samePlace = w.placeId && w.placeId === ex.placeId && w.type === 'site';
      if (isSite || isTopic || isCiv || samePlace) out.push(w);
    });
    return out;
  }

  function relatedWikiForRoom(room) {
    const ids = new Set(room.exhibits.map(e => e.id));
    const civs = new Set(room.exhibits.map(e => e.civId));
    const direct = WIKI.filter(w => (w.artifactIds || []).some(id => ids.has(id)) || (w.type === 'civ' && civs.has(w.civId))).slice(0, 7);
    if (direct.length) return direct;
    const text = `${room.title} ${room.intro.join(' ')} ${(room.sections || []).map(s => s.title).join(' ')}`;
    const topical = WIKI.filter(w => w.type === 'topic' && (text.includes(w.title) || (room.sections || []).some(s => s.title.length >= 3 && w.title.includes(s.title)))).slice(0, 7);
    if (topical.length) return topical;
    if (room.hall === 'mughal') {
      return ['civ-mughal', 'w-kundan', 'w-miniature', 'w-pattern'].map(id => WIKI_BY_ID[id]).filter(Boolean);
    }
    if (room.hall === 'persia') {
      return ['civ-safavid', 'civ-qajar', 'w-poetry', 'w-chinoiserie', 'w-rose'].map(id => WIKI_BY_ID[id]).filter(Boolean);
    }
    if (room.hall === 'ottoman') {
      return ['civ-ottoman', 'w-iznik', 'w-calligraphy', 'w-mamluk'].map(id => WIKI_BY_ID[id]).filter(Boolean);
    }
    return [];
  }

  /* ---------- 首页 / 进入 ---------- */
  function startGallery() {
    state.started = true;
    $('#intro').hidden = true;
    hideSubScreens();
    $('#gallery').hidden = false;
    $('#loadingMask').classList.add('hide');
    document.body.classList.remove('at-home');
    document.body.classList.add('in-gallery');
  }

  function backHome() {
    closeDetail();
    closeCatalog();
    closeGuide();
    closeWikiReader();
    closeWikiLightbox();
    hideSubScreens();
    $('#gallery').hidden = true;
    $('#intro').hidden = false;
    state.started = false;
    state.roomIndex = 0;
    state.overlay = null;
    document.body.classList.add('at-home');
    document.body.classList.remove('in-gallery');
  }

  function hideSubScreens() {
    if (state.map.playing) stopMapPlay();
    $('#mapScreen').hidden = true;
    $('#filterScreen').hidden = true;
    $('#wikiScreen').hidden = true;
    $('#timelineScreen').hidden = true;
  }

  /* ---------- 帝国地图 ---------- */
  function buildMapSvg() {
    const svg = $('#civMap');
    const [vx, vy, vw, vh] = MAP.viewBox;
    svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    // 等距圆柱投影：经度 -180..180、纬度 90..-90 对齐地图坐标（LON0=-120, LAT0=34, 13.2px/度）
    const rx = -792, ry = -739.2, rw = 4752, rh = 2376;
    const polities = MAP.polities || [];
    svg.innerHTML = `
      <defs>
        <linearGradient id="seaGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0e1517"/>
          <stop offset="1" stop-color="#14110d"/>
        </linearGradient>
        <filter id="civSoft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.4"/>
        </filter>
        <filter id="civGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <radialGradient id="landVeil" gradientUnits="userSpaceOnUse" cx="${vx + vw / 2}" cy="${vy + vh * 0.44}" r="${vw * 0.74}">
          <stop offset="0" stop-color="#0b0f10" stop-opacity="0.14"/>
          <stop offset="0.62" stop-color="#07090a" stop-opacity="0.42"/>
          <stop offset="1" stop-color="#05080a" stop-opacity="0.82"/>
        </radialGradient>
        ${polities.map(p => p.snapshots.map(s => `<radialGradient id="mg-${p.id}-${s.year}" gradientUnits="userSpaceOnUse" cx="${s.cx}" cy="${s.cy}" r="${s.r}">
          <stop offset="0" stop-color="${p.color}" stop-opacity="0.7"/>
          <stop offset="0.34" stop-color="${p.color}" stop-opacity="0.51"/>
          <stop offset="0.62" stop-color="${p.color}" stop-opacity="0.3"/>
          <stop offset="0.85" stop-color="${p.color}" stop-opacity="0.14"/>
          <stop offset="1" stop-color="${p.color}" stop-opacity="0.02"/>
        </radialGradient>`).join('')).join('')}
      </defs>
      <rect class="map-sea" x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="url(#seaGrad)"/>
      <g id="mapViewport">
        <g class="map-relief">
          <image href="assets/earth-atmos.jpg" x="${rx}" y="${ry}" width="${rw}" height="${rh}" preserveAspectRatio="none" opacity="0.86"/>
          <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="url(#landVeil)"/>
        </g>
        <g class="map-countries">
          ${MAP.countries.map(c => `<path d="${c.d}" fill-rule="evenodd" class="${c.inner ? 'inner' : ''}"/>`).join('')}
        </g>
        <g class="map-grat">
          ${[0, 200, 400, 600, 800, 1000, 1200].map(x => `<line x1="${vx + x}" y1="${vy}" x2="${vx + x}" y2="${vy + vh}"/>`).join('')}
          ${[0, 200, 400, 600].map(y => `<line x1="${vx}" y1="${vy + y}" x2="${vx + vw}" y2="${vy + y}"/>`).join('')}
        </g>
        <g class="map-civs">
          ${polities.map(p => `
            <g class="civ" data-id="${p.id}" style="--civ-color:${p.color}">
              ${p.snapshots.map(s => `
                <g class="civ-era" data-year="${s.year}" opacity="0">
                  <g class="civ-fill" filter="url(#civSoft)">
                    ${s.paths.map(d => `<path class="civ-area" d="${d}" fill="url(#mg-${p.id}-${s.year})"/>`).join('')}
                  </g>
                  <g class="civ-edges">
                    ${s.paths.map(d => `<path class="civ-edge" d="${d}"/>`).join('')}
                  </g>
                  <circle class="civ-capital" cx="${s.cx}" cy="${s.cy}" r="4"/>
                </g>`).join('')}
              <text x="${p.label[0]}" y="${p.label[1]}" text-anchor="middle" opacity="0">${esc(p.name)}</text>
              <title>${esc(p.name)}（${p.start}—${p.end}）</title>
            </g>`).join('')}
        </g>
        <g class="map-cities">
          ${(MAP.cities || []).map(c => `
            <g class="map-city${c.major ? ' major' : ''}">
              <circle cx="${c.x}" cy="${c.y}" r="${c.major ? 2.8 : 2.1}"/>
              <text x="${c.x + (c.dx || 6)}" y="${c.y + (c.dy || 3)}" text-anchor="${c.anchor || 'start'}">${esc(c.name)}</text>
            </g>`).join('')}
        </g>
      </g>`;
  }

  function mapApply() {
    const m = state.map;
    const vp = $('#mapViewport');
    if (vp) vp.setAttribute('transform', `translate(${m.tx} ${m.ty}) scale(${m.scale})`);
    const svg = $('#civMap');
    if (svg) svg.classList.toggle('show-minor', m.scale > 1.3);
    $$('.civ text', $('#civMap')).forEach(t => {
      const size = window.innerWidth < 720 ? 32 : 15;
      t.style.fontSize = `${size / m.scale}px`;
      t.style.strokeWidth = String(4 / m.scale);
    });
  }

  const MAP_START = 1300, MAP_END = 1922, MAP_FADE = 18;

  function mapYear() {
    return clamp(Math.round(state.map.year || 1600), MAP_START, MAP_END);
  }

  function eraWeights(p, year) {
    const snaps = p.snapshots || [];
    const n = snaps.length;
    const out = new Array(n).fill(0);
    if (!n) return out;
    if (year < snaps[0].year) return out;
    if (year >= snaps[n - 1].year) {
      let w = 1;
      if (year > p.end) w = clamp(1 - (year - p.end) / 4, 0, 1);
      out[n - 1] = w;
      return out;
    }
    let i = 0;
    while (i < n - 2 && year >= snaps[i + 1].year) i++;
    const next = snaps[i + 1];
    const t = clamp((year - (next.year - MAP_FADE)) / MAP_FADE, 0, 1);
    out[i] = 1 - t;
    out[i + 1] = t;
    return out;
  }

  function polityInfo(id) {
    const meta = (MAP.polities || []).find(p => p.id === id);
    const data = CIV_BY_ID[id];
    if (!meta && !data) return null;
    return {
      id,
      name: data ? data.name : meta.name,
      intro: data ? data.intro : (meta.intro || '本王朝在地图中作为历史背景呈现，本次展览未单列其文物。'),
      color: meta ? meta.color : data.color,
      start: data ? data.start : meta.start,
      end: data ? data.end : meta.end,
      region: data ? data.region : (meta.region || ''),
      wiki: (meta && meta.wiki) ? meta.wiki : (data ? ('civ-' + id) : ''),
      artifacts: FLAT.filter(f => f.ex.civId === id)
    };
  }

  function activePolities() {
    const year = mapYear();
    return (MAP.polities || []).filter(p => eraWeights(p, year).some(w => w > 0.05));
  }

  function updateMapEras() {
    const year = mapYear();
    $$('.civ', $('#civMap')).forEach(g => {
      const p = (MAP.polities || []).find(x => x.id === g.dataset.id);
      if (!p) return;
      const weights = eraWeights(p, year);
      let max = 0;
      $$('.civ-era', g).forEach((era, i) => {
        const w = clamp(weights[i] || 0, 0, 1);
        era.setAttribute('opacity', w < 0.01 ? '0' : w.toFixed(3));
        era.classList.toggle('era-hit', w > 0.15);
        max = Math.max(max, w);
      });
      const label = $('text', g);
      if (label) label.style.opacity = max > 0.12 ? Math.min(0.95, 0.35 + max * 0.6).toFixed(2) : '0';
      g.classList.toggle('visible', max > 0.02);
      g.classList.toggle('selected', state.map.selected === p.id);
    });
  }

  function updateMapChrome() {
    const year = mapYear();
    const names = activePolities().map(p => p.short || p.name).filter(Boolean);
    if ($('#mapYear')) $('#mapYear').textContent = `${year} 年`;
    if ($('#mapYearBig')) $('#mapYearBig').textContent = String(year);
    if ($('#mapYearEra')) {
      $('#mapYearEra').textContent = names.length
        ? names.slice(0, 4).join(' · ') + (names.length > 4 ? ' 等' : '')
        : '诸王朝';
    }
    const track = $('#mapTrack');
    if (track) track.setAttribute('aria-valuenow', String(year));
  }

  function renderMapLegend() {
    const legend = $('#mapLegend');
    if (!legend) return;
    const active = activePolities().slice();
    const sel = polityInfo(state.map.selected);
    if (sel && !active.some(p => p.id === sel.id)) {
      active.push({ id: sel.id, name: sel.name, color: sel.color, dim: true });
    }
    const key = active.map(p => p.id + (p.dim ? 'd' : '')).join(',') + '|' + (sel ? sel.id : '');
    if (legend.dataset.key === key) return;
    legend.dataset.key = key;
    legend.innerHTML = active.map(p => `
      <button type="button" class="map-chip${state.map.selected === p.id ? ' active' : ''}${p.dim ? ' dim' : ''}" data-civ="${p.id}" style="--civ-color:${p.color}">
        <i></i>${esc(p.name)}
      </button>`).join('');
    $$('.map-chip[data-civ]', legend).forEach(btn => {
      btn.addEventListener('click', () => selectCiv(btn.dataset.civ));
    });
  }

  function updateMap() {
    updateMapEras();
    updateMapChrome();
    renderMapLegend();
    renderCivPanel();
    renderCivArtifacts();
    renderCivCard();
    updateMapTimelineUI();
  }

  function refreshMapForYear() {
    updateMapEras();
    updateMapChrome();
    renderMapLegend();
    updateMapTimelineUI();
  }

  function selectCiv(id, scroll = false) {
    if (!id) return;
    state.map.selected = id;
    state.map.cardOpen = true;
    updateMapEras();
    renderMapLegend();
    renderCivPanel();
    renderCivArtifacts();
    renderCivCard();
    if (scroll && isMobileLayout()) {
      const el = $('#mapInfo');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderCivCard() {
    const card = $('#mapCivCard');
    if (!card) return;
    const c = polityInfo(state.map.selected);
    if (!c || !state.map.cardOpen) { card.hidden = true; return; }
    const regionLabel = regionLabelOf(c);
    $('#mapCivKicker').textContent = `${regionLabel} · ${yearRange(c)}`;
    $('#mapCivName').textContent = c.name;
    $('#mapCivIntro').textContent = c.intro;
    $('#mapCivWiki').hidden = !c.wiki;
    $('#mapCivFilter').hidden = !c.artifacts.length;
    $('#mapCivWiki').textContent = '查看词条 →';
    $('#mapCivFilter').textContent = `相关文物 ${c.artifacts.length}`;
    card.hidden = false;
  }

  function renderCivPanel() {
    const wrap = $('#civPanel');
    const c = polityInfo(state.map.selected);
    if (!c) {
      wrap.innerHTML = '<p class="civ-empty">点击地图上的帝国或王朝，查看简介与相关文物。</p>';
      return;
    }
    const list = c.artifacts;
    const regionLabel = regionLabelOf(c);
    wrap.innerHTML = `
      <p class="civ-kicker">${regionLabel} · ${yearRange(c)}</p>
      <h2>${esc(c.name)}</h2>
      <div class="civ-bar"><i style="background:${c.color}"></i><span>${list.length ? list.length + ' 组相关展项' : '历史地图中的背景王朝'}</span></div>
      <p class="civ-intro">${esc(c.intro)}</p>
      ${list.length ? '' : '<p class="civ-map-note">本次展览未单列该王朝的文物；可拖动时间轴，查看它与相邻帝国的疆域更替。</p>'}
      <div class="civ-panel-actions">
        ${c.wiki ? `<button class="ghost-btn civ-wiki-btn" data-civ="${c.id}">查看相关词条 →</button>` : ''}
        ${list.length ? `<button class="ghost-btn civ-filter-btn" data-civ="${c.id}">相关文物 →</button>` : ''}
      </div>`;
    const wbtn = $('.civ-wiki-btn', wrap);
    if (wbtn) wbtn.addEventListener('click', () => openWikiEntry(c.wiki, 'map'));
    const btn = $('.civ-filter-btn', wrap);
    if (btn) btn.addEventListener('click', () => {
      state.filter = { civ: c.id, place: null, limit: 120 };
      showFilterScreen();
    });
  }

  function renderCivArtifacts() {
    const wrap = $('#civArtifacts');
    const c = polityInfo(state.map.selected);
    if (!c) { wrap.innerHTML = ''; return; }
    const list = c.artifacts;
    if (!list.length) {
      wrap.innerHTML = '<p class="civ-empty">本王朝在地图中作为历史背景呈现，本次展览没有单独归类的展品。可继续拖动时间轴，查看其他年代与王朝。</p>';
      return;
    }
    const groups = CAT_ORDER.map(cat => ({
      cat,
      items: list.filter(f => f.ex.category === cat)
    })).filter(g => g.items.length);
    wrap.innerHTML = groups.map(g => `
      <section class="civ-group">
        <div class="cg-head"><h3>${esc(g.cat)}</h3><span>${g.items.length} 组</span></div>
        <div class="cg-grid">
          ${g.items.slice(0, 8).map(item => `
            <button type="button" class="cg-card" data-id="${esc(item.ex.id)}">
              <span class="cg-img"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(item.ex.hero.src)}" alt=""></span>
              <span class="cg-name">${esc(item.ex.name)}</span>
              <span class="cg-meta">${esc(placeOf(item.ex).name)} · ${esc(item.room.title)}</span>
            </button>`).join('')}
        </div>
        ${g.items.length > 8 ? `<p class="cg-more">本类共 ${g.items.length} 组，展示前 8 组。可点击“相关文物”查看全部。</p>` : ''}
      </section>`).join('');
    $$('.cg-card', wrap).forEach(btn => {
      btn.addEventListener('click', () => {
        const item = EX_BY_ID[btn.dataset.id];
        if (item) openDetailFrom(item, 'map');
      });
    });
  }

  function showMapScreen(from = 'home') {
    state.mapFrom = from;
    hideToast();
    state.subReturn = from;
    state.overlay = 'map';
    $('#intro').hidden = true;
    $('#gallery').hidden = true;
    $('#filterScreen').hidden = true;
    $('#wikiScreen').hidden = true;
    $('#timelineScreen').hidden = true;
    $('#mapScreen').hidden = false;
    document.body.classList.remove('at-home');
    document.body.classList.remove('in-gallery');
    if (!state.map.built) {
      buildMapSvg();
      state.map.built = true;
      bindMapEvents();
      buildMapTimeline();
    }
    updateMap();
    mapApply();
  }

  const MT_TICKS = [1300, 1400, 1500, 1600, 1700, 1800, 1900];

  function mtPct(year) {
    return clamp((year - MAP_START) / (MAP_END - MAP_START) * 100, 0, 100);
  }

  function buildMapTimeline() {
    const dynasties = MAP.dynasties || [];
    const labels = $('#mapLaneLabels');
    const lanes = $('#mapLanes');
    const axis = $('#mapAxis');
    if (!labels || !lanes || !axis) return;
    labels.innerHTML = dynasties.map(d => `<span title="${esc(d.name)} ${d.start}—${d.end}">${esc(d.name)}</span>`).join('');
    lanes.innerHTML = dynasties.map(d => {
      const left = mtPct(Math.max(d.start, MAP_START));
      const right = mtPct(Math.min(d.end, MAP_END));
      const width = Math.max(0.6, right - left);
      return `<div class="mt-lane"><i style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;background:${d.color}" title="${esc(d.name)} ${d.start}—${d.end}"></i></div>`;
    }).join('');
    axis.innerHTML = MT_TICKS.map(y => {
      const p = mtPct(y);
      const edge = p < 4 ? ' start' : p > 96 ? ' end' : '';
      return `<span class="mt-tick${edge}" style="left:${p.toFixed(2)}%">${y}</span>`;
    }).join('');
    bindMapTimelineEvents();
    updateMapTimelineUI();
  }

  function updateMapTimelineUI() {
    const year = mapYear();
    if ($('#mapPlayhead')) $('#mapPlayhead').style.left = `${mtPct(year).toFixed(2)}%`;
    if ($('#mapYearBig')) $('#mapYearBig').textContent = String(year);
    if ($('#mapTrack')) $('#mapTrack').setAttribute('aria-valuenow', String(year));
    const btn = $('#mapPlayBtn');
    if (btn) {
      btn.classList.toggle('playing', !!state.map.playing);
      const label = $('span', btn);
      if (label) label.textContent = state.map.playing ? '暂停' : '播放疆域变化';
      const icon = $('i', btn);
      if (icon) icon.textContent = state.map.playing ? '❚❚' : '▶';
    }
  }

  function setMapYear(y, opts = {}) {
    const next = clamp(Math.round(y), MAP_START, MAP_END);
    if (next === state.map.year && !opts.force) return;
    state.map.year = next;
    refreshMapForYear();
  }

  function stopMapPlay() {
    state.map.playing = false;
    if (state.map.raf) cancelAnimationFrame(state.map.raf);
    state.map.raf = 0;
    updateMapTimelineUI();
  }

  function toggleMapPlay() {
    if (state.map.playing) { stopMapPlay(); return; }
    if (mapYear() >= MAP_END) {
      state.map.year = MAP_START;
      refreshMapForYear();
    }
    state.map.playing = true;
    state.map.lastTick = performance.now();
    updateMapTimelineUI();
    const step = now => {
      if (!state.map.playing) return;
      const dt = Math.min(100, now - state.map.lastTick);
      state.map.lastTick = now;
      setMapYear(state.map.year + dt * 0.055);
      if (state.map.year >= MAP_END) { stopMapPlay(); return; }
      state.map.raf = requestAnimationFrame(step);
    };
    state.map.raf = requestAnimationFrame(step);
  }

  function bindMapTimelineEvents() {
    const track = $('#mapTrack');
    if (!track) return;
    let dragging = false;
    const apply = e => {
      const rect = track.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      setMapYear(MAP_START + ratio * (MAP_END - MAP_START));
    };
    track.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      stopMapPlay();
      try { track.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      apply(e);
      e.preventDefault();
    });
    track.addEventListener('pointermove', e => {
      if (!dragging) return;
      apply(e);
      e.preventDefault();
    });
    const end = e => {
      if (!dragging) return;
      dragging = false;
      try { track.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('keydown', e => {
      const step = e.shiftKey ? 50 : 10;
      let y = state.map.year;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') y -= step;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') y += step;
      else if (e.key === 'Home') y = MAP_START;
      else if (e.key === 'End') y = MAP_END;
      else return;
      e.preventDefault();
      stopMapPlay();
      setMapYear(y);
    });
    const play = $('#mapPlayBtn');
    if (play) play.addEventListener('click', toggleMapPlay);
  }

  /* ---------- 时间轴 ---------- */
  const TL_START = 1299, TL_END = 1925, TL_BASE_PX = 4.2, TL_BIN = 20, TL_LANE = 122;

  function timelineYear(ex) {
    const y = String(ex.period || '').match(/(1[0-9]{3}|20[0-9]{2})/);
    if (y) return +y[1];
    const c = String(ex.period || '').match(/(\d{1,2})世纪/);
    if (c) return (+c[1] - 1) * 100 + 50;
    return (CIV_BY_ID[ex.civId] || {}).start || TL_START;
  }

  function timelineGroups(civId) {
    const bins = new Map();
    FLAT.filter(f => f.ex.civId === civId).forEach(item => {
      const y = timelineYear(item.ex);
      const bin = Math.floor((y - TL_START) / TL_BIN) * TL_BIN + TL_START;
      if (!bins.has(bin)) bins.set(bin, []);
      bins.get(bin).push(item);
    });
    return [...bins.entries()].sort((a, b) => a[0] - b[0]);
  }

  function timelineCivs() {
    return ['ottoman', 'safavid', 'qajar', 'mughal', 'timurid'].map(id => CIV_BY_ID[id]).filter(Boolean);
  }

  function timelineWidth() {
    return (TL_END - TL_START) * TL_BASE_PX * state.timeline.scale;
  }

  function timelineX(year) {
    return (year - TL_START) / (TL_END - TL_START) * timelineWidth();
  }

  function renderTimelineScreen() {
    const civs = timelineCivs();
    const width = timelineWidth();
    const height = 48 + civs.length * TL_LANE;
    const ticks = [];
    for (let y = 1300; y <= 1900; y += 50) {
      const x = timelineX(y);
      ticks.push(`<span class="tl-tick" style="left:${x}px"><i></i>${y}</span>`);
    }
    $('#timelineLabels').innerHTML = `<div class="tl-lane-label tl-axis-spacer">年代</div>${civs.map(c => {
      const count = FLAT.filter(f => f.ex.civId === c.id).length;
      return `<div class="tl-lane-label" style="--civ-color:${c.color}"><b>${esc(c.name)}</b><span>${c.start}—${c.end}</span><small>${count} 组</small></div>`;
    }).join('')}`;
    $('#timelineCanvas').style.width = width + 'px';
    $('#timelineCanvas').style.height = height + 'px';
    $('#timelineCanvas').innerHTML = `
      <div class="tl-axis" style="height:48px">${ticks.join('')}</div>
      ${civs.map(c => {
        const groups = timelineGroups(c.id);
        return `<div class="tl-lane" style="--civ-color:${c.color};height:${TL_LANE}px">
          <div class="tl-lane-bar" style="left:${timelineX(c.start)}px;width:${Math.max(4, timelineX(c.end) - timelineX(c.start))}px"></div>
          ${groups.map(([bin, items]) => {
            const x = timelineX(bin);
            const thumbs = items.slice(0, 3).map(item => `<img src="${esc(item.ex.hero.src)}" alt="" referrerpolicy="no-referrer" loading="lazy">`).join('');
            return `<button type="button" class="tl-cluster" data-timeline-civ="${c.id}" data-timeline-bin="${bin}" style="left:${x + 4}px;--civ-color:${c.color}" title="${esc(c.name)} · ${bin}—${bin + TL_BIN}：${items.length} 组">
              <span class="tl-stack">${thumbs}</span>
              <span class="tl-cluster-meta"><b>${items.length}</b> 组<br><i>${bin}—${bin + TL_BIN}</i></span>
            </button>`;
          }).join('')}
        </div>`;
      }).join('')}`;
    $('#timelineLegend').innerHTML = civs.map(c => `<span style="--civ-color:${c.color}"><i></i>${esc(c.name)}</span>`).join('');
    if (state.timeline.selectedKey) renderTimelineItems();
    else $('#timelineItems').innerHTML = '<p class="timeline-empty">拖动时间线浏览各帝国器物；点击任意年代组查看该组全部文物。</p>';
    $('#timelineCanvas').querySelectorAll('.tl-cluster').forEach(btn => {
      btn.addEventListener('click', () => selectTimelineCluster(btn.dataset.timelineCiv, +btn.dataset.timelineBin));
    });
  }

  function applyTimelinePan() {
    const vp = $('#timelineViewport');
    const max = Math.max(0, timelineWidth() - vp.clientWidth);
    state.timeline.x = clamp(state.timeline.x, 0, max);
    state.timeline.targetX = state.timeline.x;
    $('#timelineCanvas').style.transform = `translate3d(${-state.timeline.x}px,0,0)`;
  }

  function selectTimelineCluster(civId, bin) {
    state.timeline.selectedKey = civId + ':' + bin;
    const c = CIV_BY_ID[civId];
    const items = FLAT.filter(f => f.ex.civId === civId && Math.floor((timelineYear(f.ex) - TL_START) / TL_BIN) * TL_BIN + TL_START === bin)
      .sort((a, b) => timelineYear(a.ex) - timelineYear(b.ex));
    state.timeline.selectedItems = items;
    $('#timelineItems').innerHTML = `
      <div class="tl-items-head">
        <p class="eyebrow">${esc(c.name)} · ${bin}—${bin + TL_BIN}</p>
        <h3>${items.length} 组相关文物</h3>
        <p>点击任意文物进入详情；关闭详情后会回到这里。</p>
      </div>
      <div class="tl-items-grid">${items.map(item => `
        <button type="button" class="tl-item-card" data-timeline-ex="${esc(item.ex.id)}">
          <span class="tl-item-img"><img src="${esc(item.ex.hero.src)}" alt="" referrerpolicy="no-referrer" loading="lazy"></span>
          <span class="tl-item-name">${esc(item.ex.name)}</span>
          <span class="tl-item-meta">${esc(item.ex.period)} · ${esc(placeOf(item.ex).name)}</span>
        </button>`).join('')}</div>`;
    $('#timelineItems').querySelectorAll('[data-timeline-ex]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = EX_BY_ID[btn.dataset.timelineEx];
        if (item) openDetailFrom(item, 'timeline');
      });
    });
    $('#timelineItems').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function bindTimelineEvents() {
    const vp = $('#timelineViewport');
    vp.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      state.timeline.dragging = true;
      state.timeline.moved = false;
      state.timeline.justDragged = false;
      state.timeline.startX = e.clientX;
      state.timeline.origX = state.timeline.x;
    });
    vp.addEventListener('pointermove', e => {
      if (!state.timeline.dragging) return;
      const dx = e.clientX - state.timeline.startX;
      if (Math.abs(dx) > 4) {
        state.timeline.moved = true;
        state.timeline.justDragged = true;
        if (!vp.hasPointerCapture(e.pointerId)) {
          try { vp.setPointerCapture(e.pointerId); } catch (err) {}
        }
      }
      if (!state.timeline.moved) return;
      state.timeline.x = state.timeline.origX - dx;
      applyTimelinePan();
    });
    const end = () => {
      state.timeline.dragging = false;
      setTimeout(() => { state.timeline.justDragged = false; }, 250);
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    vp.addEventListener('click', e => {
      if (state.timeline.justDragged) {
        e.preventDefault();
        e.stopPropagation();
        state.timeline.justDragged = false;
      }
    }, true);
    vp.addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      state.timeline.x += e.deltaY;
      applyTimelinePan();
    }, { passive: false });
    $('#timelineZoomIn').addEventListener('click', () => timelineZoom(1.5));
    $('#timelineZoomOut').addEventListener('click', () => timelineZoom(1 / 1.5));
    $('#timelineReset').addEventListener('click', () => {
      state.timeline.scale = 1;
      state.timeline.x = 0;
      renderTimelineScreen();
      applyTimelinePan();
    });
  }

  function timelineZoom(factor) {
    const old = state.timeline.scale;
    const next = clamp(old * factor, 1, 2.5);
    if (Math.abs(next - old) < 0.01) return;
    const center = state.timeline.x + $('#timelineViewport').clientWidth / 2;
    state.timeline.scale = next;
    state.timeline.x = center * (next / old) - $('#timelineViewport').clientWidth / 2;
    renderTimelineScreen();
    applyTimelinePan();
  }

  function showTimelineScreen(from = 'home') {
    state.timelineFrom = from;
    hideToast();
    state.subReturn = from;
    state.overlay = 'timeline';
    $('#intro').hidden = true;
    $('#gallery').hidden = true;
    hideSubScreens();
    $('#timelineScreen').hidden = false;
    document.body.classList.remove('at-home');
    document.body.classList.remove('in-gallery');
    if (!state.timeline.built) {
      renderTimelineScreen();
      bindTimelineEvents();
      state.timeline.built = true;
      state.timeline.x = Math.max(0, timelineX(1450) - 30);
    }
    applyTimelinePan();
  }

  function bindMapEvents() {
    const svg = $('#civMap');
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const m = state.map;
      const rect = svg.getBoundingClientRect();
      const [vx, vy, vw, vh] = MAP.viewBox;
      const mx = vx + (e.clientX - rect.left) / rect.width * vw;
      const my = vy + (e.clientY - rect.top) / rect.height * vh;
      const factor = e.deltaY < 0 ? 1.18 : 0.85;
      const ns = clamp(m.scale * factor, 1, 7);
      const k = ns / m.scale;
      m.tx = mx - (mx - m.tx) * k;
      m.ty = my - (my - m.ty) * k;
      m.scale = ns;
      mapApply();
    }, { passive: false });

    svg.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const m = state.map;
      m.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (m.pointers.size === 2) {
        const pts = [...m.pointers.values()];
        m.pinch = { dist: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)), scale: m.scale };
        m.dragging = false;
        return;
      }
      m.dragging = true;
      m.moved = false;
      m.pressedCiv = (e.target.closest && e.target.closest('.civ')) ? e.target.closest('.civ').dataset.id : null;
      m.startX = e.clientX;
      m.startY = e.clientY;
      m.origTx = m.tx;
      m.origTy = m.ty;
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    svg.addEventListener('pointermove', e => {
      const m = state.map;
      if (m.pointers.has(e.pointerId)) m.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (m.pinch && m.pointers.size >= 2) {
        const pts = [...m.pointers.values()];
        const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
        m.scale = clamp(m.pinch.scale * (dist / m.pinch.dist), 1, 7);
        mapApply();
        return;
      }
      if (!m.dragging) return;
      const dx = e.clientX - m.startX;
      const dy = e.clientY - m.startY;
      if (Math.abs(dx) + Math.abs(dy) > 6) m.moved = true;
      m.tx = m.origTx + dx;
      m.ty = m.origTy + dy;
      mapApply();
    });
    const end = e => {
      const m = state.map;
      m.pointers.delete(e.pointerId);
      if (m.pointers.size < 2) m.pinch = null;
      if (m.pointers.size === 0) m.dragging = false;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('click', e => {
      const g = e.target.closest ? e.target.closest('.civ') : null;
      const id = state.map.pressedCiv || (g && g.dataset.id);
      state.map.pressedCiv = null;
      if (!id) {
        if (!state.map.moved) { state.map.cardOpen = false; $('#mapCivCard').hidden = true; }
        return;
      }
      if (state.map.moved) return;
      selectCiv(id);
    });
  }

  /* ---------- 分类查找 ---------- */
  function buildFilterChips() {
    const civCounts = {};
    const placeCounts = {};
    FLAT.forEach(f => {
      civCounts[f.ex.civId] = (civCounts[f.ex.civId] || 0) + 1;
      placeCounts[f.ex.placeId] = (placeCounts[f.ex.placeId] || 0) + 1;
    });
    const civs = DATA.civs.filter(c => civCounts[c.id] && !c.hidden).sort((a, b) => civCounts[b.id] - civCounts[a.id]);
    const places = DATA.places.filter(p => placeCounts[p.id] && !p.hidden).sort((a, b) => placeCounts[b.id] - placeCounts[a.id]);

    $('#civChips').innerHTML = civs.map(c => `
      <button type="button" class="filter-chip civ${state.filter.civ === c.id ? ' active' : ''}" data-civ="${c.id}">
        <i style="background:${c.color}"></i>${esc(c.name)}<small>${civCounts[c.id]}</small>
      </button>`).join('');
    $('#placeChips').innerHTML = places.map(p => `
      <button type="button" class="filter-chip place${state.filter.place === p.id ? ' active' : ''}" data-place="${p.id}">
        ${esc(p.name)}<small>${placeCounts[p.id]}</small>
      </button>`).join('');

    $$('#civChips .filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        state.filter.civ = state.filter.civ === btn.dataset.civ ? null : btn.dataset.civ;
        state.filter.limit = 120;
        buildFilterChips();
        renderFilterResults();
      });
    });
    $$('#placeChips .filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        state.filter.place = state.filter.place === btn.dataset.place ? null : btn.dataset.place;
        state.filter.limit = 120;
        buildFilterChips();
        renderFilterResults();
      });
    });
  }

  function filterItems() {
    return FLAT.filter(f => {
      if (state.filter.civ && f.ex.civId !== state.filter.civ) return false;
      if (state.filter.place && f.ex.placeId !== state.filter.place) return false;
      return true;
    });
  }

  function renderFilterResults() {
    const items = filterItems();
    const civ = state.filter.civ ? CIV_BY_ID[state.filter.civ] : null;
    const place = state.filter.place ? PLACE_BY_ID[state.filter.place] : null;
    const parts = [];
    if (civ) parts.push(civ.name);
    if (place) parts.push(place.name);
    $('#filterSummary').innerHTML = `
      <div><b>${items.length}</b> 组展项${parts.length ? ' · ' + parts.map(esc).join(' / ') : ' · 全部帝国与地点'}</div>
      ${parts.length ? '<button type="button" class="link-btn" id="clearFilterBtn">清除全部筛选</button>' : ''}`;
    const clr = $('#clearFilterBtn');
    if (clr) clr.addEventListener('click', () => {
      state.filter = { civ: null, place: null, limit: 120 };
      buildFilterChips();
      renderFilterResults();
    });

    const wrap = $('#filterResults');
    if (!items.length) {
      wrap.innerHTML = '<p class="catalog-empty">当前条件下没有展项，试试放宽筛选。</p>';
      return;
    }
    const shown = items.slice(0, state.filter.limit);
    wrap.innerHTML = `
      <div class="filter-grid">
        ${shown.map(item => `
          <button type="button" class="filter-card" data-id="${esc(item.ex.id)}">
            <span class="fc-img"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(item.ex.hero.src)}" alt=""></span>
            <span class="fc-body">
              <span class="fc-name">${esc(item.ex.name)}</span>
              <span class="fc-meta">${esc(civOf(item.ex).name)} · ${esc(placeOf(item.ex).name)}</span>
              <span class="fc-room">${esc(item.ex.category)} · ${esc(item.room.title)}</span>
            </span>
          </button>`).join('')}
      </div>
      ${items.length > shown.length ? `<div class="filter-more"><button type="button" class="ghost-btn" id="filterMoreBtn">显示更多（还有 ${items.length - shown.length} 组）</button></div>` : ''}`;
    $$('.filter-card', wrap).forEach(btn => {
      btn.addEventListener('click', () => {
        const item = EX_BY_ID[btn.dataset.id];
        if (item) openDetailFrom(item, 'filter');
      });
    });
    const more = $('#filterMoreBtn');
    if (more) more.addEventListener('click', () => {
      state.filter.limit += 120;
      renderFilterResults();
    });
  }

  function showFilterScreen(from = 'home') {
    state.filterFrom = from;
    hideToast();
    state.subReturn = from;
    state.overlay = 'filter';
    $('#intro').hidden = true;
    $('#gallery').hidden = true;
    $('#mapScreen').hidden = true;
    $('#wikiScreen').hidden = true;
    $('#timelineScreen').hidden = true;
    $('#filterScreen').hidden = false;
    document.body.classList.remove('at-home');
    document.body.classList.remove('in-gallery');
    buildFilterChips();
    renderFilterResults();
  }

  function openDetailFrom(item, from) {
    startGallery();
    enterRoom(item.ri, false, 'start');
    openDetail(item.ri, item.ei, 0, from);
  }

  function leaveSubScreen() {
    if (state.overlay === 'filter' && state.subReturn === 'map') { showMapScreen(state.mapFrom || 'home'); return; }
    if (state.overlay === 'wiki') {
      if (state.wikiFrom === 'map') { showMapScreen(state.mapFrom || 'home'); return; }
      if (state.wikiFrom === 'filter') { showFilterScreen(state.filterFrom || 'home'); return; }
      if (state.wikiFrom === 'timeline') { showTimelineScreen(state.timelineFrom || 'home'); return; }
      if (state.wikiFrom === 'gallery' && state.started) {
        hideSubScreens();
        $('#gallery').hidden = false;
        state.overlay = null;
        return;
      }
    }
    if (state.subReturn === 'gallery' && state.started) {
      hideSubScreens();
      $('#gallery').hidden = false;
      state.overlay = null;
    } else {
      backHome();
    }
  }

  /* ---------- 覆盖层判断 ---------- */
  function anyOverlay() {
    return !$('#threshold').hidden || !$('#detail').hidden || !$('#catalog').hidden || !$('#guide').hidden || !$('#tagWiki').hidden || !$('#wikiReader').hidden || !$('#wikiLightbox').hidden;
  }

  /* ---------- 背景音乐 ---------- */
  const Music = {
    audio: null, wanted: true, started: false,
    init() {
      this.audio = $('#bgMusic');
      if (!this.audio) return;
      this.audio.volume = 0.55;
      this.audio.addEventListener('play', () => { this.started = true; updateMusicUI(); });
      this.audio.addEventListener('pause', updateMusicUI);
      ['#introMusicBtn', '#galleryMusicBtn', '#mapMusicBtn', '#wikiMusicBtn', '#timelineMusicBtn', '#filterMusicBtn'].forEach(sel => {
        const btn = $(sel);
        if (btn) btn.addEventListener('click', () => toggleMusic());
      });
      const first = e => {
        if (e.target.closest && e.target.closest('.music-btn')) return;
        if (this.wanted && !this.started) startMusic();
        cleanup();
      };
      const cleanup = () => {
        document.removeEventListener('pointerdown', first, true);
        document.removeEventListener('keydown', first, true);
      };
      document.addEventListener('pointerdown', first, true);
      document.addEventListener('keydown', first, true);
      updateMusicUI();
    },
    start() {
      if (!this.audio) return;
      this.wanted = true;
      const p = this.audio.play();
      if (p && p.catch) p.catch(() => { this.started = false; updateMusicUI(); });
    },
    pause() {
      this.wanted = false;
      if (this.audio) this.audio.pause();
      updateMusicUI();
    }
  };
  function startMusic() { Music.start(); }
  function toggleMusic() { if (Music.started && !Music.audio.paused) Music.pause(); else Music.start(); }
  function updateMusicUI() {
    const playing = !!(Music.audio && !Music.audio.paused);
    ['#introMusicBtn', '#galleryMusicBtn', '#mapMusicBtn', '#wikiMusicBtn', '#timelineMusicBtn', '#filterMusicBtn'].forEach(sel => {
      const btn = $(sel); if (!btn) return;
      btn.classList.toggle('playing', playing);
      const t = btn.querySelector('.music-text, .lbl-full');
      if (t) t.textContent = playing ? 'Ceddin Deden · 播放中' : 'Ceddin Deden';
    });
  }

  /* ---------- 事件 ---------- */
  function bindEvents() {
    // 首页
    $('#introMapBtn').addEventListener('click', () => showMapScreen('home'));
    $('#introWikiBtn').addEventListener('click', () => showWikiScreen('home'));
    $('#introTimelineBtn').addEventListener('click', () => showTimelineScreen('home'));
    $('#introCatalogBtn').addEventListener('click', openCatalog);
    $('#introGuideBtn').addEventListener('click', openGuide);
    $('#openMapBtn').addEventListener('click', () => showMapScreen('home'));
    $('#openWikiBtn').addEventListener('click', () => showWikiScreen('home'));
    $('#openTimelineBtn').addEventListener('click', () => showTimelineScreen('home'));

    // 展厅顶栏
    $('#backHomeBtn').addEventListener('click', backHome);
    $('#openCatalogBtn').addEventListener('click', openCatalog);
    $('#openGuideBtn').addEventListener('click', openGuide);
    $('#openMapBtn2').addEventListener('click', () => showMapScreen('gallery'));
    $('#openWikiBtn2').addEventListener('click', () => showWikiScreen('gallery'));
    $('#openTimelineBtn2').addEventListener('click', () => showTimelineScreen('gallery'));

    // 门槛
    $('#thresholdEnterBtn').addEventListener('click', skipThreshold);
    $('#threshold').addEventListener('click', e => { if (e.target === $('#threshold')) skipThreshold(); });

    // 展厅移动
    $('#prevBtn').addEventListener('click', () => step(-1));
    $('#nextBtn').addEventListener('click', () => step(1));
    $('#wallViewport').addEventListener('wheel', e => {
      if (anyOverlay()) return;
      e.preventDefault();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      setPanTarget(state.targetPan + delta * 1.05);
      $('#panHint').classList.add('hide');
    }, { passive: false });

    const vp = $('#wallViewport');
    vp.addEventListener('pointerdown', e => {
      if (e.button !== 0 || anyOverlay()) return;
      state.dragging = true;
      state.dragMoved = false;
      state.dragStartX = e.clientX;
      state.dragStartPan = state.panX;
      state.dragLastX = e.clientX;
      state.dragLastT = performance.now();
      state.dragVelocity = 0;
      if (state.panRaf) { cancelAnimationFrame(state.panRaf); state.panRaf = 0; }
      vp.classList.add('dragging');
    });
    vp.addEventListener('pointermove', e => {
      if (!state.dragging) return;
      const dx = e.clientX - state.dragStartX;
      if (Math.abs(dx) > 6) {
        state.dragMoved = true;
        $('#panHint').classList.add('hide');
      }
      const now = performance.now();
      const dt = Math.max(1, now - state.dragLastT);
      state.dragVelocity = (e.clientX - state.dragLastX) / dt;
      state.dragLastX = e.clientX;
      state.dragLastT = now;
      applyPanInstant(state.dragStartPan - dx);
    });
    const scheduleDock = () => {
      if (state.depthRaf) return;
      state.depthRaf = requestAnimationFrame(() => {
        state.depthRaf = 0;
        updateDepth();
      });
    };
    vp.addEventListener('pointermove', e => {
      if (state.dragging || e.pointerType === 'touch') return;
      state.pointerX = e.clientX;
      scheduleDock();
    });
    vp.addEventListener('pointerleave', () => {
      state.pointerX = null;
      scheduleDock();
    });
    const endDrag = () => {
      if (!state.dragging) return;
      state.dragging = false;
      vp.classList.remove('dragging');
      if (state.dragMoved) {
        const momentum = clamp(-state.dragVelocity * 160, -520, 520);
        if (Math.abs(momentum) > 40) setPanTarget(state.panX + momentum);
      }
    };
    vp.addEventListener('pointerup', endDrag);
    vp.addEventListener('pointercancel', endDrag);
    vp.addEventListener('pointerleave', endDrag);
    vp.addEventListener('click', e => {
      if (state.dragMoved) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    // 详情
    $('#detailCloseBtn').addEventListener('click', closeDetail);
    $('#detailPrevBtn').addEventListener('click', () => stepDetail(-1));
    $('#detailNextBtn').addEventListener('click', () => stepDetail(1));
    $('#detailTags').addEventListener('click', e => {
      const chip = e.target.closest('.tag-chip');
      if (chip) openTagWiki(chip.dataset.tag, chip.dataset.kind);
    });
    $('#twCloseBtn').addEventListener('click', closeTagWiki);
    $('#tagWiki').addEventListener('click', e => { if (e.target === $('#tagWiki')) closeTagWiki(); });
    $('#zoomInBtn').addEventListener('click', () => zoomViewer(1.25));
    $('#zoomOutBtn').addEventListener('click', () => zoomViewer(0.8));
    $('#zoomResetBtn').addEventListener('click', () => fitViewer('all'));
    $('#viewerFullBtn').addEventListener('click', () => setViewerFullscreen(!state.viewer.fullscreen));
    $('#viewerExitBtn').addEventListener('click', () => setViewerFullscreen(false));

    const stage = $('#viewerStage');
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      zoomViewer(e.deltaY < 0 ? 1.18 : 0.85);
    }, { passive: false });
    stage.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const v = state.viewer;
      v.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (v.pointers.size === 2) {
        const pts = [...v.pointers.values()];
        v.pinch = { dist: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)), scale: v.scale };
        v.dragging = false;
        stage.classList.remove('dragging');
        return;
      }
      v.dragging = true;
      v.startX = e.clientX;
      v.startY = e.clientY;
      v.origX = v.x;
      v.origY = v.y;
      stage.classList.add('dragging');
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    stage.addEventListener('pointermove', e => {
      const v = state.viewer;
      if (v.pointers.has(e.pointerId)) v.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (v.pinch && v.pointers.size >= 2) {
        const pts = [...v.pointers.values()];
        const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
        v.scale = clamp(v.pinch.scale * (dist / v.pinch.dist), 1, 12);
        clampViewer();
        applyViewer();
        return;
      }
      if (!v.dragging) return;
      v.x = v.origX + (e.clientX - v.startX);
      v.y = v.origY + (e.clientY - v.startY);
      clampViewer();
      applyViewer();
    });
    const endViewerPointer = e => {
      const v = state.viewer;
      v.pointers.delete(e.pointerId);
      if (v.pointers.size < 2) v.pinch = null;
      if (v.pointers.size === 1) {
        const p = [...v.pointers.values()][0];
        v.startX = p.x;
        v.startY = p.y;
        v.origX = v.x;
        v.origY = v.y;
        v.dragging = true;
      } else if (v.pointers.size === 0) {
        v.dragging = false;
        stage.classList.remove('dragging');
      }
    };
    stage.addEventListener('pointerup', endViewerPointer);
    stage.addEventListener('pointercancel', endViewerPointer);
    stage.addEventListener('pointerleave', endViewerPointer);
    stage.addEventListener('dblclick', () => {
      if (state.viewer.scale > 1.2) fitViewer('all');
      else { zoomViewer(3); clampViewer(); applyViewer(); }
    });

    // 目录
    $('#catalogCloseBtn').addEventListener('click', closeCatalog);
    $('#catalogSearch').addEventListener('input', e => {
      state.catalogQuery = e.target.value;
      renderCatalog();
      $('#catalog').scrollTop = 0;
    });
    $('#catalogGrid').addEventListener('click', e => {
      const card = e.target.closest('.cat-card');
      if (!card || card.dataset.opening === '1') return;
      const item = EX_BY_ID[card.dataset.id];
      if (!item) return;
      card.dataset.opening = '1';
      card.classList.add('tap-pop');
      setTimeout(() => {
        delete card.dataset.opening;
        closeCatalog();
        startGallery();
        enterRoom(item.ri, false, 'start');
        openDetail(item.ri, item.ei, 0, 'catalog');
      }, 220);
      setTimeout(() => card.classList.remove('tap-pop'), 500);
    });
    $('#catalogGrid').addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.cat-card');
      if (!card) return;
      e.preventDefault();
      const item = EX_BY_ID[card.dataset.id];
      if (!item) return;
      closeCatalog();
      startGallery();
      enterRoom(item.ri, false, 'start');
      openDetail(item.ri, item.ei, 0, 'catalog');
    });

    // 指南
    $('#guideCloseBtn').addEventListener('click', closeGuide);

    // 地图 / 筛选页
    $('#mapBackBtn').addEventListener('click', leaveSubScreen);
    $('#timelineBackBtn').addEventListener('click', leaveSubScreen);
    $('#filterBackBtn').addEventListener('click', leaveSubScreen);
    $('#wikiBackBtn').addEventListener('click', leaveSubScreen);
    $('#wikiMapBtn').addEventListener('click', () => showMapScreen('home'));
    $('#wikiTimelineBtn').addEventListener('click', () => showTimelineScreen('wiki'));
    $('#wikiFilterBtn').addEventListener('click', () => showFilterScreen('home'));
    $('#wikiCatalogBtn').addEventListener('click', openCatalog);
    $('#mapWikiBtn').addEventListener('click', () => showWikiScreen('map'));
    $('#mapTimelineBtn').addEventListener('click', () => showTimelineScreen('map'));
    $('#timelineMapBtn').addEventListener('click', () => showMapScreen('home'));
    $('#timelineWikiBtn').addEventListener('click', () => showWikiScreen('timeline'));
    $('#timelineCatalogBtn').addEventListener('click', openCatalog);
    $('#filterWikiBtn').addEventListener('click', () => showWikiScreen('filter'));
    $('#filterMapBtn').addEventListener('click', () => showMapScreen('home'));
    $('#mapCatalogBtn').addEventListener('click', openCatalog);
    $('#filterCatalogBtn').addEventListener('click', openCatalog);

    // 词条
    $('#wikiSearch').addEventListener('input', e => {
      state.wiki.query = e.target.value;
      renderWikiGrid();
      $('#wikiScreen').scrollTop = 0;
    });
    $('#wikiReaderBack').addEventListener('click', closeWikiReader);
    $('#wikiReaderClose').addEventListener('click', closeWikiReader);
    $('#wikiLightboxClose').addEventListener('click', closeWikiLightbox);
    $('#wikiLightboxPrev').addEventListener('click', () => stepWikiLightbox(-1));
    $('#wikiLightboxNext').addEventListener('click', () => stepWikiLightbox(1));
    $('#wikiLightbox').addEventListener('click', e => {
      if (e.target === $('#wikiLightbox')) closeWikiLightbox();
    });
    const wlImg = $('#wikiLightboxImg');
    wlImg.draggable = false;
    $('#wikiLightbox').addEventListener('wheel', e => {
      if ($('#wikiLightbox').hidden) return;
      e.preventDefault();
      const st = state.wikiLight;
      const rect = wlImg.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      const factor = e.deltaY < 0 ? 1.18 : 0.85;
      const ns = clamp(st.scale * factor, 1, 4);
      const k = ns / st.scale;
      st.x -= cx * (k - 1);
      st.y -= cy * (k - 1);
      st.scale = ns;
      if (ns <= 1) { st.x = 0; st.y = 0; }
      wikiLightApply();
    }, { passive: false });
    wlImg.addEventListener('pointerdown', e => {
      const st = state.wikiLight;
      if (st.scale <= 1) return;
      st.dragging = true;
      st.startX = e.clientX;
      st.startY = e.clientY;
      st.origX = st.x;
      st.origY = st.y;
      wlImg.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    wlImg.addEventListener('pointermove', e => {
      const st = state.wikiLight;
      if (!st.dragging) return;
      st.x = st.origX + e.clientX - st.startX;
      st.y = st.origY + e.clientY - st.startY;
      wikiLightApply();
    });
    const endWikiDrag = () => {
      const st = state.wikiLight;
      if (!st.dragging) return;
      st.dragging = false;
      wikiLightApply();
    };
    wlImg.addEventListener('pointerup', endWikiDrag);
    wlImg.addEventListener('pointercancel', endWikiDrag);
    wlImg.addEventListener('dblclick', e => {
      const st = state.wikiLight;
      st.scale = st.scale > 1 ? 1 : 2;
      if (st.scale === 1) { st.x = 0; st.y = 0; }
      wikiLightApply();
      e.preventDefault();
    });

    // 地图文明简介卡
    $('#mapCivClose').addEventListener('click', () => { state.map.cardOpen = false; $('#mapCivCard').hidden = true; });
    $('#mapCivWiki').addEventListener('click', () => {
      const c = polityInfo(state.map.selected);
      if (c && c.wiki) openWikiEntry(c.wiki, 'map');
    });
    $('#mapCivFilter').addEventListener('click', () => {
      if (!state.map.selected) return;
      state.filter = { civ: state.map.selected, place: null, limit: 120 };
      showFilterScreen('map');
    });
    $('#mapZoomIn').addEventListener('click', () => {
      const m = state.map;
      m.scale = clamp(m.scale * 1.25, 1, 7);
      mapApply();
    });
    $('#mapZoomOut').addEventListener('click', () => {
      const m = state.map;
      m.scale = clamp(m.scale * 0.8, 1, 7);
      if (m.scale === 1) { m.tx = 0; m.ty = 0; }
      mapApply();
    });
    $('#mapReset').addEventListener('click', () => {
      state.map.scale = 1;
      state.map.tx = 0;
      state.map.ty = 0;
      mapApply();
    });
    $$('[data-clear]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.filter[btn.dataset.clear] = null;
        state.filter.limit = 120;
        buildFilterChips();
        renderFilterResults();
      });
    });

    // 键盘
    window.addEventListener('keydown', e => {
      if (!$('#wikiLightbox').hidden) {
        if (e.key === 'Escape') { closeWikiLightbox(); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); stepWikiLightbox(-1); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); stepWikiLightbox(1); return; }
        return;
      }
      if (!$('#wikiReader').hidden) {
        if (e.key === 'Escape') closeWikiReader();
        return;
      }
      if (!$('#tagWiki').hidden) {
        if (e.key === 'Escape') closeTagWiki();
        return;
      }
      if (e.key === 'Escape') {
        if (state.overlay === 'detail') {
          if (state.viewer.fullscreen) { setViewerFullscreen(false); return; }
          closeDetail();
          return;
        }
        if (state.overlay === 'catalog') { closeCatalog(); return; }
        if (state.overlay === 'guide') { closeGuide(); return; }
        if (state.overlay === 'threshold') { skipThreshold(); return; }
        if (state.overlay === 'wiki') { leaveSubScreen(); return; }
        if (state.overlay === 'map' || state.overlay === 'filter') { leaveSubScreen(); return; }
        if (state.overlay === 'timeline') { leaveSubScreen(); return; }
        return;
      }
      if (state.overlay === 'detail') {
        if (e.key === 'ArrowLeft') { e.preventDefault(); stepDetail(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); stepDetail(1); }
        return;
      }
      if (anyOverlay()) return;
      if (!state.started || $('#gallery').hidden) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'Home') { e.preventDefault(); setPanTarget(0); }
      if (e.key === 'End') { e.preventDefault(); setPanTarget(state.wallMax); }
    });

    // 窗口尺寸
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (state.started && !$('#gallery').hidden) {
          const ratio = state.wallMax ? state.panX / state.wallMax : 0;
          renderWall(state.roomIndex);
          requestAnimationFrame(() => {
            measureWall();
            applyPanInstant(ratio * state.wallMax);
          });
        }
        if (state.overlay === 'detail' && state.detail) {
          const ex = DATA.rooms[state.detail.ri].exhibits[state.detail.ei];
          renderViewer(ex, state.detail.imgIndex);
        }
        if (state.overlay === 'timeline') applyTimelinePan();
        if (state.overlay === 'map') mapApply();
      }, 220);
    });
  }

  /* ---------- 启动 ---------- */
  function hideLoading() {
    if (loadingDone) return;
    loadingDone = true;
    $('#loadingMask').classList.add('hide');
  }

  function boot() {
    document.body.classList.add('at-home');
    loadVisited();
    renderHome();
    renderRoutes();
    updateProgress();
    bindEvents();
    Music.init();

    const first = DATA.rooms[0].exhibits.slice(0, 8).map(ex => ex.hero.src);
    let loaded = 0;
    if (!first.length) hideLoading();
    first.forEach(src => {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      const done = () => { loaded += 1; if (loaded >= first.length) hideLoading(); };
      img.onload = done;
      img.onerror = done;
      img.src = src;
    });
    setTimeout(hideLoading, 3200);
  }

  boot();
})();
