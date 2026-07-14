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
  const STORAGE_KEY = 'gerador-imagens:v1';

  // ---------- persistence ----------
  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function persist() {
    try {
      const data = {
        version: 1,
        activeCategoryId: state.activeCategoryId,
        canvasColor: state.canvasColor,
        selectedSeconds: state.selectedSeconds,
        categories: Object.fromEntries(
          Object.entries(state.categories).map(([id, cs]) => [id, {
            removedDefaults: Array.from(cs.removed),
            uploads: cs.images.filter((img) => img.kind === 'upload').map((img) => ({ key: img.key, dataUrl: img.url, name: img.name })),
            currentIndex: cs.currentIndex,
          }]),
        ),
        drawings: state.drawings,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Não foi possível salvar as alterações localmente (armazenamento indisponível ou cheio).', e);
    }
  }

  function fileToResizedDataUrl(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Falha ao carregar imagem'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  const persisted = loadPersisted();

  function makeCategoryState(catId, order) {
    const persistedCat = persisted?.categories?.[catId];
    const removed = new Set(persistedCat?.removedDefaults || []);
    const images = [];
    for (let i = 1; i <= DEFAULT_TOTAL; i++) {
      if (removed.has(i)) continue;
      const isLocalCover = catId === 'cenario' && i === 1;
      images.push({
        kind: 'default',
        key: `default-${i}`,
        defaultIndex: i,
        url: isLocalCover ? LOCAL_PHOTO : `https://picsum.photos/seed/${catId}-${i}/700/1127`,
        name: isLocalCover ? 'img2349.png' : `img${2349 + order * 100 + i - 1}.png`,
      });
    }
    (persistedCat?.uploads || []).forEach((u) => {
      images.push({ kind: 'upload', key: u.key, url: u.dataUrl, name: u.name });
    });
    const currentIndex = persistedCat?.currentIndex
      ? Math.min(Math.max(1, persistedCat.currentIndex), Math.max(images.length, 1))
      : 1;
    return { removed, images, currentIndex };
  }

  // ---------- state ----------
  const state = {
    activeCategoryId: persisted?.activeCategoryId && CATEGORIES.some((c) => c.id === persisted.activeCategoryId)
      ? persisted.activeCategoryId
      : CATEGORIES[0].id,
    categories: Object.fromEntries(CATEGORIES.map((c, i) => [c.id, makeCategoryState(c.id, i)])),
    modalCategoryId: null,
    canvasColor: persisted?.canvasColor || '#D9D9D9',
    selectedSeconds: persisted?.selectedSeconds || null,
    isPlaying: false,
    duration: 0,
    remaining: 0,
    lastTs: null,
    timerHandle: null,
    // drawings are keyed per category then per image key: { [catId]: { [imgKey]: {dataUrl, name} } }
    drawings: persisted?.drawings || {},
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
  const modalOverlay = document.getElementById('modalOverlay');
  const modalTitle = document.getElementById('modalCategoryTitle');
  const modalCount = document.getElementById('modalCount');
  const modalGrid = document.getElementById('modalGrid');
  const modalClose = document.getElementById('modalClose');
  const modalAddInput = document.getElementById('modalAddInput');
  const modalCategoryToggle = document.getElementById('modalCategoryToggle');
  const modalCategoryDropdown = document.getElementById('modalCategoryDropdown');

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
    more.title = 'Mais categorias';
    more.innerHTML = '<span>&lt;</span>';
    categoriesBar.appendChild(more);

    const folder = document.createElement('button');
    folder.className = 'category-folder-btn';
    folder.id = 'btnManageCategory';
    folder.title = 'Gerenciar fotos da categoria';
    folder.setAttribute('aria-label', 'Gerenciar fotos da categoria');
    folder.innerHTML = `
      <svg viewBox="0 0 24 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 4.5C2 3.11929 3.11929 2 4.5 2H9.5L11.5 4.5H19.5C20.8807 4.5 22 5.61929 22 7V15.5C22 16.8807 20.8807 18 19.5 18H4.5C3.11929 18 2 16.8807 2 15.5V4.5Z" stroke="white" stroke-width="1.6" stroke-linejoin="round"/>
      </svg>`;
    folder.addEventListener('click', openModal);
    categoriesBar.appendChild(folder);
  }

  function selectCategory(id) {
    if (id === state.activeCategoryId) return;
    state.activeCategoryId = id;
    renderCategories();
    renderImage();
    restartTimer();
    persist();
  }

  // ---------- image helpers ----------
  function catState(id) {
    return state.categories[id || state.activeCategoryId];
  }

  function renderImage() {
    const cs = catState();
    const total = cs.images.length;
    if (total === 0) {
      cs.currentIndex = 0;
      canvasImage.style.opacity = '0';
      filenameLabel.textContent = 'sem imagens nesta categoria';
      paginationLabel.textContent = '0 de 0';
      refreshDrawingPanel();
      return;
    }
    if (cs.currentIndex > total) cs.currentIndex = total;
    if (cs.currentIndex < 1) cs.currentIndex = 1;
    const img = cs.images[cs.currentIndex - 1];
    canvasImage.style.opacity = '0';
    canvasImage.onload = () => { canvasImage.style.opacity = '1'; };
    canvasImage.src = img.url;
    filenameLabel.textContent = img.name;
    paginationLabel.textContent = `${cs.currentIndex} de ${total}`;
    refreshDrawingPanel();
  }

  function goTo(index) {
    const cs = catState();
    const total = cs.images.length;
    if (total === 0) { renderImage(); return; }
    cs.currentIndex = ((index - 1) % total + total) % total + 1;
    renderImage();
    persist();
  }

  function nextImage() { goTo(catState().currentIndex + 1); }
  function prevImage() { goTo(catState().currentIndex - 1); }

  async function addFilesToCategory(catId, files) {
    if (!files.length) return;
    const cs = catState(catId);
    const firstNewIndex = cs.images.length + 1;
    const newEntries = await Promise.all(files.map(async (file) => ({
      kind: 'upload',
      key: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: await fileToResizedDataUrl(file, 1000, 0.85),
      name: file.name,
    })));
    cs.images.push(...newEntries);
    if (catId === state.activeCategoryId) {
      goTo(firstNewIndex);
    } else {
      persist();
    }
  }

  function deleteImageFromCategory(catId, index) {
    const cs = catState(catId);
    const [removedImg] = cs.images.splice(index - 1, 1);
    if (removedImg && removedImg.kind === 'default') cs.removed.add(removedImg.defaultIndex);
    if (removedImg && state.drawings[catId]) delete state.drawings[catId][removedImg.key];
    if (catId === state.activeCategoryId) renderImage();
    persist();
  }

  // ---------- add photos to category (footer "+") ----------
  btnAdd.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    addFilesToCategory(state.activeCategoryId, Array.from(fileInput.files || []));
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
  Array.from(dotsWrap.querySelectorAll('.dot')).forEach((dot) => {
    if (dot.dataset.color.toUpperCase() === state.canvasColor.toUpperCase()) dot.classList.add('active');
    dot.addEventListener('click', () => {
      const color = dot.dataset.color;
      state.canvasColor = color;
      canvasFill.style.backgroundColor = color;
      dotsWrap.querySelectorAll('.dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
      persist();
    });
  });
  canvasFill.style.backgroundColor = state.canvasColor;

  // ---------- timer / presets ----------
  Array.from(presetButtons.querySelectorAll('.preset-btn')).forEach((btn) => {
    if (Number(btn.dataset.seconds) === state.selectedSeconds) btn.classList.add('active');
    btn.addEventListener('click', () => {
      presetButtons.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedSeconds = Number(btn.dataset.seconds);
      updatePlayButtonState();
      restartTimer();
      persist();
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

  // ---------- attach drawing (tied to the specific photo currently shown) ----------
  function currentImage() {
    const cs = catState();
    if (!cs || cs.currentIndex < 1) return null;
    return cs.images[cs.currentIndex - 1] || null;
  }

  function showDrawingPreview(dataUrl) {
    drawingPreview.src = dataUrl;
    drawingPreview.hidden = false;
    cameraIconGroup.style.display = 'none';
    cameraPanelLabel.style.display = 'none';
    btnRemoveDrawing.hidden = false;
  }

  function hideDrawingPreview() {
    drawingPreview.hidden = true;
    drawingPreview.removeAttribute('src');
    cameraIconGroup.style.display = '';
    cameraPanelLabel.style.display = '';
    btnRemoveDrawing.hidden = true;
  }

  function refreshDrawingPanel() {
    const img = currentImage();
    const drawing = img ? state.drawings[state.activeCategoryId]?.[img.key] : null;
    if (drawing) showDrawingPreview(drawing.dataUrl);
    else hideDrawingPreview();
  }

  cameraPanel.addEventListener('click', () => drawingInput.click());
  cameraPanel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drawingInput.click(); }
  });
  drawingInput.addEventListener('change', async () => {
    const file = drawingInput.files && drawingInput.files[0];
    const img = currentImage();
    if (!file || !img) return;
    const dataUrl = await fileToResizedDataUrl(file, 1400, 0.88);
    const catId = state.activeCategoryId;
    if (!state.drawings[catId]) state.drawings[catId] = {};
    state.drawings[catId][img.key] = { dataUrl, name: file.name };
    showDrawingPreview(dataUrl);
    drawingInput.value = '';
    persist();
  });
  btnRemoveDrawing.addEventListener('click', (e) => {
    e.stopPropagation();
    const img = currentImage();
    const catId = state.activeCategoryId;
    if (img && state.drawings[catId]) delete state.drawings[catId][img.key];
    hideDrawingPreview();
    persist();
  });

  // ---------- category manager modal ----------
  function categoryLabel(id) {
    return CATEGORIES.find((c) => c.id === id)?.label || id;
  }

  function renderModal() {
    const catId = state.modalCategoryId;
    const cs = catState(catId);
    modalTitle.textContent = categoryLabel(catId);
    modalCount.textContent = `${cs.images.length} foto${cs.images.length === 1 ? '' : 's'}`;
    modalGrid.innerHTML = '';

    cs.images.forEach((img, i) => {
      const index = i + 1;
      const isCurrent = catId === state.activeCategoryId && index === cs.currentIndex;
      const tile = document.createElement('div');
      tile.className = 'modal-thumb' + (isCurrent ? ' active' : '');
      tile.innerHTML = `
        <img src="${img.url}" alt="${img.name}" loading="lazy" />
        <button class="modal-thumb-delete" title="Excluir esta foto" aria-label="Excluir esta foto">&times;</button>
      `;
      tile.addEventListener('click', () => {
        if (catId !== state.activeCategoryId) {
          state.activeCategoryId = catId;
          renderCategories();
          restartTimer();
        }
        goTo(index);
        renderModal();
      });
      tile.querySelector('.modal-thumb-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteImageFromCategory(catId, index);
        renderModal();
      });
      modalGrid.appendChild(tile);
    });

    const addTile = document.createElement('button');
    addTile.className = 'modal-thumb modal-thumb-add';
    addTile.title = 'Adicionar fotos a esta categoria';
    addTile.setAttribute('aria-label', 'Adicionar fotos a esta categoria');
    addTile.textContent = '+';
    addTile.addEventListener('click', () => modalAddInput.click());
    modalGrid.appendChild(addTile);
  }

  function renderModalCategoryDropdown() {
    modalCategoryDropdown.innerHTML = '';
    CATEGORIES.forEach((cat) => {
      const item = document.createElement('button');
      item.className = 'modal-category-option' + (cat.id === state.modalCategoryId ? ' current' : '');
      const countLabel = state.categories[cat.id].images.length;
      item.innerHTML = `<span>${cat.label} (${countLabel})</span>` + (cat.id === state.activeCategoryId ? '<span class="modal-category-tag">ativa</span>' : '');
      item.addEventListener('click', () => {
        state.modalCategoryId = cat.id;
        modalCategoryDropdown.hidden = true;
        renderModal();
      });
      modalCategoryDropdown.appendChild(item);
    });
  }

  modalCategoryToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const willShow = modalCategoryDropdown.hidden;
    if (willShow) renderModalCategoryDropdown();
    modalCategoryDropdown.hidden = !willShow;
  });

  function openModal() {
    state.modalCategoryId = state.activeCategoryId;
    modalCategoryDropdown.hidden = true;
    renderModal();
    modalOverlay.hidden = false;
  }

  function closeModal() {
    modalOverlay.hidden = true;
    modalCategoryDropdown.hidden = true;
  }

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalOverlay.hidden) closeModal();
  });
  document.addEventListener('click', (e) => {
    if (!modalCategoryDropdown.hidden && !modalCategoryDropdown.contains(e.target) && e.target !== modalCategoryToggle) {
      modalCategoryDropdown.hidden = true;
    }
  });
  modalAddInput.addEventListener('change', async () => {
    await addFilesToCategory(state.modalCategoryId, Array.from(modalAddInput.files || []));
    modalAddInput.value = '';
    renderModal();
  });

  // ---------- init ----------
  renderCategories();
  renderImage();
  setPlayIcon(state.isPlaying);
  restartTimer();
})();
