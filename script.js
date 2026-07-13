(() => {
  'use strict';

  const CATEGORIES = [
    { id: 'cenario', label: 'cenário' },
    { id: 'anime', label: 'anime' },
    { id: 'capa-de-album', label: 'capa de álbum' },
    { id: 'dupla', label: 'dupla' },
    { id: 'animais-terrestres', label: 'animais terrestres' },
    { id: 'animais-marinhos', label: 'animais marinhos' },
    { id: 'espaco', label: 'espaço' },
  ];

  const DEFAULT_TOTAL = 30;
  const LOCAL_PHOTO = 'assets/img/img2349.png';

  // per-category state: total default images + user uploads + current index (1-based)
  const state = {
    activeCategoryId: CATEGORIES[0].id,
    categories: Object.fromEntries(
      CATEGORIES.map((c, i) => [c.id, { defaultTotal: DEFAULT_TOTAL, uploads: [], currentIndex: 1, catOrder: i }])
    ),
    canvasColor: '#D9D9D9',
    selectedSeconds: null,
    isPlaying: false,
    duration: 0,
    remaining: 0,
    lastTs: null,
    timerHandle: null,
    drawingUrl: null,
  };

  // ---------- element refs ----------
  const categoriesBar = document.getElementById('categoriesBar');
  const filenameLabel = document.getElementById('filenameLabel');
  const canvasImage = document.getElementById('canvasImage');
  const canvasFill = document.getElementById('canvasFill');
  const paginationLabel = document.getElementById('paginationLabel');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnPlay = document.getElementById('btnPlay');
  const iconPause = document.getElementById('icon-pause');
  const iconPlay = document.getElementById('icon-play');
  const btnAdd = document.getElementById('btnAdd');
  const fileInput = document.getElementById('fileInput');
  const dotsWrap = document.getElementById('paginationDots');
  const presetButtons = document.getElementById('presetButtons');
  const hourHand = document.getElementById('hourHand');
  const minuteHand = document.getElementById('minuteHand');
  const clockDigital = document.getElementById('clockDigital');
  const cameraPanel = document.getElementById('cameraPanel');
  const drawingInput = document.getElementById('drawingInput');
  const drawingPreview = document.getElementById('drawingPreview');
  const cameraIconGroup = document.getElementById('cameraIconGroup');
  const cameraPanelLabel = document.getElementById('cameraPanelLabel');
  const btnRemoveDrawing = document.getElementById('btnRemoveDrawing');
  const playHint = document.getElementById('playHint');

  // ---------- categories ----------
  function renderCategories() {
    categoriesBar.innerHTML = '';
    CATEGORIES.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'category-chip' + (cat.id === state.activeCategoryId ? ' active' : '');
      btn.textContent = cat.label;
      btn.dataset.id = cat.id;
      btn.addEventListener('click', () => selectCategory(cat.id));
      categoriesBar.appendChild(btn);
    });
    const more = document.createElement('button');
    more.className = 'category-more';
    more.innerHTML = '<span>&lt;</span>';
    categoriesBar.appendChild(more);
  }

  function selectCategory(id) {
    if (id === state.activeCategoryId) return;
    state.activeCategoryId = id;
    renderCategories();
    renderImage();
    restartTimer();
  }

  // ---------- image helpers ----------
  function catState() {
    return state.categories[state.activeCategoryId];
  }

  function totalImages(cs) {
    return cs.defaultTotal + cs.uploads.length;
  }

  function imageSrcAt(catId, index) {
    const cs = state.categories[catId];
    if (index <= cs.defaultTotal) {
      if (catId === 'cenario' && index === 1) return LOCAL_PHOTO;
      return `https://picsum.photos/seed/${catId}-${index}/700/1127`;
    }
    return cs.uploads[index - cs.defaultTotal - 1].url;
  }

  function imageNameAt(catId, index) {
    const cs = state.categories[catId];
    if (index <= cs.defaultTotal) {
      if (catId === 'cenario' && index === 1) return 'img2349.png';
      return `img${2349 + cs.catOrder * 100 + index - 1}.png`;
    }
    return cs.uploads[index - cs.defaultTotal - 1].name;
  }

  function renderImage() {
    const cs = catState();
    const total = totalImages(cs);
    if (cs.currentIndex > total) cs.currentIndex = total;
    if (cs.currentIndex < 1) cs.currentIndex = 1;
    canvasImage.style.opacity = '0';
    const src = imageSrcAt(state.activeCategoryId, cs.currentIndex);
    const name = imageNameAt(state.activeCategoryId, cs.currentIndex);
    const applied = () => {
      canvasImage.style.opacity = '1';
    };
    canvasImage.onload = applied;
    canvasImage.src = src;
    filenameLabel.textContent = name;
    paginationLabel.textContent = `${cs.currentIndex} de ${total}`;
  }

  function goTo(index) {
    const cs = catState();
    const total = totalImages(cs);
    cs.currentIndex = ((index - 1) % total + total) % total + 1;
    renderImage();
  }

  function nextImage() { goTo(catState().currentIndex + 1); }
  function prevImage() { goTo(catState().currentIndex - 1); }

  // ---------- add photos to category ----------
  btnAdd.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
    const cs = catState();
    const firstNewIndex = totalImages(cs) + 1;
    files.forEach((file) => {
      cs.uploads.push({ url: URL.createObjectURL(file), name: file.name });
    });
    goTo(firstNewIndex);
    fileInput.value = '';
  });

  // ---------- transport ----------
  btnPrev.addEventListener('click', () => { prevImage(); restartTimer(); });
  btnNext.addEventListener('click', () => { nextImage(); restartTimer(); });
  btnPlay.addEventListener('click', togglePlay);

  function setPlayIcon(playing) {
    iconPause.style.display = playing ? '' : 'none';
    iconPlay.style.display = playing ? 'none' : '';
  }

  function updatePlayButtonState() {
    btnPlay.classList.toggle('disabled', state.selectedSeconds == null);
    playHint.hidden = state.selectedSeconds == null || state.isPlaying;
  }

  function togglePlay() {
    if (state.selectedSeconds == null) return;
    state.isPlaying = !state.isPlaying;
    setPlayIcon(state.isPlaying);
    updatePlayButtonState();
    if (state.isPlaying) {
      state.lastTs = null;
      tick();
    } else if (state.timerHandle) {
      cancelAnimationFrame(state.timerHandle);
      state.timerHandle = null;
    }
  }

  // ---------- colored dots -> canvas background ----------
  Array.from(dotsWrap.querySelectorAll('.dot')).forEach((dot, i) => {
    if (i === 2) dot.classList.add('active'); // matches default canvas fill #D9D9D9
    dot.addEventListener('click', () => {
      const color = dot.dataset.color;
      state.canvasColor = color;
      canvasFill.style.backgroundColor = color;
      dotsWrap.querySelectorAll('.dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
    });
  });
  canvasFill.style.backgroundColor = state.canvasColor;

  // ---------- timer / presets ----------
  Array.from(presetButtons.querySelectorAll('.preset-btn')).forEach((btn) => {
    btn.addEventListener('click', () => {
      presetButtons.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedSeconds = Number(btn.dataset.seconds);
      updatePlayButtonState();
      restartTimer();
    });
  });
  updatePlayButtonState();

  function restartTimer() {
    if (state.timerHandle) cancelAnimationFrame(state.timerHandle);
    state.timerHandle = null;
    state.duration = state.selectedSeconds ? state.selectedSeconds * 1000 : 0;
    state.remaining = state.duration;
    state.lastTs = null;
    updateClockUI();
    if (state.isPlaying && state.duration > 0) tick();
  }

  function updateClockUI() {
    const progress = state.duration > 0 ? 1 - state.remaining / state.duration : 0;
    minuteHand.style.transform = `rotate(${progress * 360}deg)`;
    hourHand.style.transform = `rotate(${progress * 30}deg)`;
    const totalSec = Math.max(0, Math.ceil(state.remaining / 1000));
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    clockDigital.textContent = `${mm}:${ss}`;
  }

  function tick(ts) {
    if (!state.isPlaying) return;
    if (state.lastTs == null) state.lastTs = ts || performance.now();
    const now = ts || performance.now();
    const delta = now - state.lastTs;
    state.lastTs = now;
    state.remaining -= delta;
    if (state.remaining <= 0) {
      state.remaining = 0;
      updateClockUI();
      nextImage();
      state.remaining = state.duration;
      state.lastTs = null;
      state.timerHandle = requestAnimationFrame(tick);
      return;
    }
    updateClockUI();
    state.timerHandle = requestAnimationFrame(tick);
  }

  // ---------- attach drawing ----------
  cameraPanel.addEventListener('click', () => drawingInput.click());
  cameraPanel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drawingInput.click(); }
  });
  drawingInput.addEventListener('change', () => {
    const file = drawingInput.files && drawingInput.files[0];
    if (!file) return;
    if (state.drawingUrl) URL.revokeObjectURL(state.drawingUrl);
    state.drawingUrl = URL.createObjectURL(file);
    drawingPreview.src = state.drawingUrl;
    drawingPreview.hidden = false;
    cameraIconGroup.style.display = 'none';
    cameraPanelLabel.style.display = 'none';
    btnRemoveDrawing.hidden = false;
    drawingInput.value = '';
  });
  btnRemoveDrawing.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.drawingUrl) URL.revokeObjectURL(state.drawingUrl);
    state.drawingUrl = null;
    drawingPreview.hidden = true;
    drawingPreview.removeAttribute('src');
    cameraIconGroup.style.display = '';
    cameraPanelLabel.style.display = '';
    btnRemoveDrawing.hidden = true;
  });

  // ---------- init ----------
  renderCategories();
  renderImage();
  setPlayIcon(state.isPlaying);
  restartTimer();
})();
