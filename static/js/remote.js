// CouchPC Mobile Remote Controller

let ws = null;
let isConnected = false;
let currentVolume = 50;
let isMuted = false;
let isDragLocked = false;
let shortcutsList = [];

// DOM Elements
const statusDot = document.getElementById('status-dot');
const volSlider = document.getElementById('vol-slider');
const volVal = document.getElementById('vol-val');
const muteBtn = document.getElementById('btn-mute');
const trackpadSurface = document.getElementById('trackpad-surface');
const scrollStrip = document.getElementById('scroll-strip');
const btnLeftClick = document.getElementById('btn-left-click');
const btnRightClick = document.getElementById('btn-right-click');
const btnDragLock = document.getElementById('btn-drag-lock');
const appsGrid = document.getElementById('apps-grid');
const textInput = document.getElementById('text-input');
const quickBackBar = document.getElementById('quick-back-bar');
const btnRemoteBackTv = document.getElementById('btn-remote-back-tv');

// Live Soft Keyboard Elements
const liveKeyboardInput = document.getElementById('live-keyboard-input');
const typingDock = document.getElementById('typing-dock');
const btnHideKeyboard = document.getElementById('btn-hide-keyboard');
const btnSummonKb = document.getElementById('btn-summon-kb');
const btnAutoKb = document.getElementById('btn-auto-kb');

let autoKB = localStorage.getItem('couch_auto_kb') !== 'false'; // default ON

function updateAutoKbUI() {
  if (btnAutoKb) {
    btnAutoKb.classList.toggle('active', autoKB);
    btnAutoKb.textContent = autoKB ? '⌨️ Auto-KB: ON' : '⌨️ Auto-KB: OFF';
  }
}
updateAutoKbUI();

if (btnAutoKb) {
  btnAutoKb.addEventListener('click', () => {
    autoKB = !autoKB;
    localStorage.setItem('couch_auto_kb', autoKB);
    updateAutoKbUI();
    vibrate(15);
  });
}

function summonKeyboard() {
  if (!liveKeyboardInput) return;
  liveKeyboardInput.value = '';
  prevInputText = '';
  liveKeyboardInput.focus();
}

let prevInputText = '';
if (liveKeyboardInput) {
  liveKeyboardInput.addEventListener('focus', () => {
    if (typingDock) typingDock.classList.add('active');
    vibrate(15);
  });

  liveKeyboardInput.addEventListener('blur', () => {
    if (typingDock) typingDock.classList.remove('active');
    liveKeyboardInput.value = '';
    prevInputText = '';
  });

  liveKeyboardInput.addEventListener('input', () => {
    const cur = liveKeyboardInput.value;
    if (cur.length > prevInputText.length) {
      const added = cur.substring(prevInputText.length);
      sendWS({ type: 'type_text', text: added });
    } else if (cur.length < prevInputText.length) {
      const deleted = prevInputText.length - cur.length;
      for (let i = 0; i < deleted; i++) {
        sendWS({ type: 'key_press', key: 'backspace' });
      }
    }
    prevInputText = cur;
  });

  liveKeyboardInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendWS({ type: 'key_press', key: 'enter' });
      liveKeyboardInput.value = '';
      prevInputText = '';
      liveKeyboardInput.blur();
    } else if (e.key === 'Backspace' && liveKeyboardInput.value.length === 0) {
      sendWS({ type: 'key_press', key: 'backspace' });
    }
  });
}

if (btnHideKeyboard) {
  btnHideKeyboard.addEventListener('click', () => {
    if (liveKeyboardInput) liveKeyboardInput.blur();
    vibrate(15);
  });
}

if (btnSummonKb) {
  btnSummonKb.addEventListener('click', () => {
    vibrate(20);
    summonKeyboard();
  });
}

function vibrate(ms = 20) {
  if (navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (e) {}
  }
}

// ----------------- WebSocket Connection -----------------
function initWebSocket() {
  const wsHost = window.location.hostname || '127.0.0.1';
  const isHttps = window.location.protocol === 'https:';
  const wsPort = window.SERVER_WS_PORT || (isHttps ? '5002' : '5001');
  const wsProtocol = isHttps ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}`;

  console.log(`Connecting to WebSocket at ${wsUrl}...`);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Connected to CouchPC WebSocket server');
    isConnected = true;
    statusDot.className = 'status-dot connected';
    sendWS({ type: 'get_status' });
    loadShortcuts();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (e) {
      console.error('Error parsing WS message:', e);
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected. Retrying in 1.5s...');
    isConnected = false;
    statusDot.className = 'status-dot disconnected';
    setTimeout(initWebSocket, 1500);
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    ws.close();
  };
}

function sendWS(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function handleServerMessage(msg) {
  if (msg.type === 'volume_state') {
    currentVolume = msg.value;
    isMuted = msg.muted;
    volSlider.value = currentVolume;
    volVal.textContent = isMuted ? 'MUTED' : `${currentVolume}%`;
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
  } else if (msg.type === 'shortcuts_updated') {
    shortcutsList = msg.shortcuts;
    renderShortcuts(shortcutsList);
  } else if (msg.type === 'settings_updated') {
    if (msg.settings && msg.settings.background) {
      document.body.style.backgroundImage = `url('${msg.settings.background}')`;
    }
  }
}

// Quick Return to TV Button
if (btnRemoteBackTv) {
  btnRemoteBackTv.addEventListener('click', () => {
    vibrate(30);
    sendWS({ type: 'launch', target: 'tv_mode', launch_type: 'action' });
    quickBackBar.classList.remove('active');
  });
}

// ----------------- Trackpad & Gestures -----------------
let touchStartX = 0;
let touchStartY = 0;
let lastTouchX = 0;
let lastTouchY = 0;
let touchStartTime = 0;
let touchCount = 0;
let isMoving = false;

trackpadSurface.addEventListener('touchstart', (e) => {
  e.preventDefault();
  touchCount = e.touches.length;
  touchStartTime = Date.now();
  isMoving = false;

  if (touchCount === 1) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    lastTouchX = touchStartX;
    lastTouchY = touchStartY;
  } else if (touchCount === 2) {
    lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
  }
}, { passive: false });

trackpadSurface.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (e.touches.length === 1) {
    const curX = e.touches[0].clientX;
    const curY = e.touches[0].clientY;
    const dx = curX - lastTouchX;
    const dy = curY - lastTouchY;

    if (Math.abs(curX - touchStartX) > 4 || Math.abs(curY - touchStartY) > 4) {
      isMoving = true;
    }

    lastTouchX = curX;
    lastTouchY = curY;

    sendWS({ type: 'mouse_move', dx: dx, dy: dy });
  } else if (e.touches.length === 2) {
    const curY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const dy = curY - lastTouchY;
    lastTouchY = curY;
    isMoving = true;
    sendWS({ type: 'mouse_scroll', delta: Math.round(dy * -18) });
  }
}, { passive: false });

trackpadSurface.addEventListener('touchend', (e) => {
  e.preventDefault();
  const touchDuration = Date.now() - touchStartTime;

  if (!isMoving && touchDuration < 280) {
    if (touchCount === 1) {
      vibrate(20);
      sendWS({ type: 'mouse_click', button: 'left' });
      if (autoKB) {
        summonKeyboard();
      }
    } else if (touchCount === 2) {
      vibrate(35);
      sendWS({ type: 'mouse_click', button: 'right' });
    }
  }
}, { passive: false });

// Scroll Strip
let scrollStartY = 0;
scrollStrip.addEventListener('touchstart', (e) => {
  e.preventDefault();
  scrollStartY = e.touches[0].clientY;
}, { passive: false });

scrollStrip.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const curY = e.touches[0].clientY;
  const dy = curY - scrollStartY;
  scrollStartY = curY;
  sendWS({ type: 'mouse_scroll', delta: Math.round(dy * -25) });
}, { passive: false });

// Click buttons
btnLeftClick.addEventListener('click', () => {
  vibrate(20);
  sendWS({ type: 'mouse_click', button: 'left' });
  if (autoKB) {
    summonKeyboard();
  }
});

btnRightClick.addEventListener('click', () => {
  vibrate(30);
  sendWS({ type: 'mouse_click', button: 'right' });
});

btnDragLock.addEventListener('click', () => {
  vibrate(30);
  isDragLocked = !isDragLocked;
  if (isDragLocked) {
    btnDragLock.classList.add('locked');
    btnDragLock.textContent = '🔓 Unlock';
    sendWS({ type: 'mouse_down', button: 'left' });
  } else {
    btnDragLock.classList.remove('locked');
    btnDragLock.textContent = '🔒 Drag';
    sendWS({ type: 'mouse_up', button: 'left' });
  }
});

// ----------------- Volume Controls -----------------
volSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  volVal.textContent = `${val}%`;
  sendWS({ type: 'set_volume', value: val });
});

muteBtn.addEventListener('click', () => {
  vibrate(25);
  sendWS({ type: 'toggle_mute' });
});

document.getElementById('vol-down').addEventListener('click', () => {
  vibrate(15);
  sendWS({ type: 'key_press', key: 'volume_down' });
});

document.getElementById('vol-up').addEventListener('click', () => {
  vibrate(15);
  sendWS({ type: 'key_press', key: 'volume_up' });
});

// ----------------- Mode Switcher -----------------
const btnModeTv = document.getElementById('btn-mode-tv');
const btnModePc = document.getElementById('btn-mode-pc');

btnModeTv.addEventListener('click', () => {
  vibrate(30);
  btnModeTv.classList.add('active');
  btnModePc.classList.remove('active');
  sendWS({ type: 'launch', target: 'tv_mode', launch_type: 'action' });
  quickBackBar.classList.remove('active');
});

btnModePc.addEventListener('click', () => {
  vibrate(30);
  btnModePc.classList.add('active');
  btnModeTv.classList.remove('active');
  sendWS({ type: 'launch', target: 'pc_mode', launch_type: 'action' });
});

// ----------------- Navigation D-Pad & Keys -----------------
document.querySelectorAll('[data-key]').forEach(btn => {
  btn.addEventListener('click', () => {
    vibrate(20);
    const key = btn.getAttribute('data-key');
    sendWS({ type: 'key_press', key: key });
  });
});

document.querySelectorAll('[data-hotkey]').forEach(btn => {
  btn.addEventListener('click', () => {
    vibrate(30);
    const hotkey = btn.getAttribute('data-hotkey');
    sendWS({ type: 'hotkey', combo: hotkey });
  });
});

// ----------------- Keyboard & Text Input -----------------
document.getElementById('btn-send-text').addEventListener('click', () => {
  const text = textInput.value;
  if (text) {
    vibrate(20);
    sendWS({ type: 'type_text', text: text });
    textInput.value = '';
  }
});

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('btn-send-text').click();
  }
});

// ----------------- App Shortcuts & Management -----------------
let isEditMode = false;
let activeCategory = 'All';
let draggedShortcutId = null;

const btnToggleEditMode = document.getElementById('btn-toggle-edit-mode');
const editModeBar = document.getElementById('edit-mode-bar');
const btnDoneEdit = document.getElementById('btn-done-edit');
const btnSortAz = document.getElementById('btn-sort-az');
const btnSortCat = document.getElementById('btn-sort-cat');

async function loadShortcuts() {
  try {
    const res = await fetch('/api/shortcuts');
    shortcutsList = await res.json();
    renderShortcuts(shortcutsList);
  } catch (e) {
    console.error('Failed to load shortcuts:', e);
  }
}

async function saveReorderedShortcuts(newOrderIds) {
  try {
    const res = await fetch('/api/shortcuts/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: newOrderIds })
    });
    const data = await res.json();
    if (data.shortcuts) {
      shortcutsList = data.shortcuts;
      renderShortcuts(shortcutsList);
    }
  } catch (e) {
    console.error('Error saving reordered shortcuts:', e);
  }
}

function moveShortcut(id, direction) {
  const currentIndex = shortcutsList.findIndex(s => s.id === id);
  if (currentIndex === -1) return;

  const newOrder = [...shortcutsList];
  const [removed] = newOrder.splice(currentIndex, 1);

  if (direction === 'top') {
    newOrder.unshift(removed);
  } else if (direction === 'left') {
    const targetIndex = Math.max(0, currentIndex - 1);
    newOrder.splice(targetIndex, 0, removed);
  } else if (direction === 'right') {
    const targetIndex = Math.min(newOrder.length, currentIndex + 1);
    newOrder.splice(targetIndex, 0, removed);
  }

  saveReorderedShortcuts(newOrder.map(s => s.id));
}

function renderShortcuts(list) {
  appsGrid.innerHTML = '';

  const filtered = activeCategory === 'All'
    ? list
    : list.filter(s => (s.category || 'Streaming') === activeCategory);

  filtered.forEach(app => {
    const card = document.createElement('div');
    card.className = `app-card ${isEditMode ? 'edit-active' : ''}`;
    card.dataset.id = app.id;
    card.draggable = isEditMode;

    const firstLetter = (app.name || 'A')[0].toUpperCase();

    card.innerHTML = `
      <button class="app-card-del-btn" data-del-id="${app.id}" title="Delete Shortcut">✕</button>
      <div class="app-card-icon-wrap" style="background: ${app.color || 'var(--primary-color)'}">
        <span style="font-weight:900; font-size:26px;">${firstLetter}</span>
      </div>
      <div class="app-card-name">${app.name}</div>
      <div class="app-card-category">${app.category || 'App'}</div>
      
      <!-- Reorder Bar in Edit Mode -->
      <div class="card-reorder-bar">
        <button type="button" class="btn-reorder btn-move-left" data-move-id="${app.id}" data-dir="left" title="Move Left">◀</button>
        <button type="button" class="btn-reorder btn-move-top" data-move-id="${app.id}" data-dir="top" title="Move to Top">🔝</button>
        <button type="button" class="btn-reorder btn-move-right" data-move-id="${app.id}" data-dir="right" title="Move Right">▶</button>
      </div>
    `;

    // Click to launch (when not in edit mode)
    card.addEventListener('click', (e) => {
      if (isEditMode) return;
      if (e.target.closest('.app-card-del-btn') || e.target.closest('.card-reorder-bar')) return;
      vibrate(35);
      sendWS({
        type: 'launch',
        target: app.target,
        launch_type: app.type || 'url'
      });
      if (quickBackBar) quickBackBar.classList.add('active');
    });

    // Delete button
    const delBtn = card.querySelector('.app-card-del-btn');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        vibrate(25);
        if (confirm(`Delete "${app.name}" shortcut?`)) {
          await fetch(`/api/shortcuts/${app.id}`, { method: 'DELETE' });
          loadShortcuts();
        }
      });
    }

    // Reorder buttons (Move Left, Top, Right)
    card.querySelectorAll('.btn-reorder').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vibrate(20);
        const sid = btn.dataset.moveId;
        const dir = btn.dataset.dir;
        moveShortcut(sid, dir);
      });
    });

    // Touch / Mouse Drag & Drop Reordering
    card.addEventListener('dragstart', (e) => {
      draggedShortcutId = app.id;
      card.classList.add('dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!draggedShortcutId || draggedShortcutId === app.id) return;
      const fromIdx = shortcutsList.findIndex(s => s.id === draggedShortcutId);
      const toIdx = shortcutsList.findIndex(s => s.id === app.id);
      if (fromIdx !== -1 && toIdx !== -1) {
        vibrate(30);
        const newOrder = [...shortcutsList];
        const [moved] = newOrder.splice(fromIdx, 1);
        newOrder.splice(toIdx, 0, moved);
        saveReorderedShortcuts(newOrder.map(s => s.id));
      }
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggedShortcutId = null;
    });

    appsGrid.appendChild(card);
  });
}

// Category Filters
document.querySelectorAll('.cat-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    vibrate(15);
    document.querySelectorAll('.cat-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.category;
    renderShortcuts(shortcutsList);
  });
});

// Edit Mode Toggle
function setEditMode(state) {
  isEditMode = state;
  if (btnToggleEditMode) btnToggleEditMode.classList.toggle('active', isEditMode);
  if (editModeBar) editModeBar.classList.toggle('active', isEditMode);
  renderShortcuts(shortcutsList);
  vibrate(25);
}

if (btnToggleEditMode) {
  btnToggleEditMode.addEventListener('click', () => {
    setEditMode(!isEditMode);
  });
}

if (btnDoneEdit) {
  btnDoneEdit.addEventListener('click', () => {
    setEditMode(false);
  });
}

// Quick Sorting (A-Z and Category)
if (btnSortAz) {
  btnSortAz.addEventListener('click', () => {
    vibrate(20);
    const sorted = [...shortcutsList].sort((a, b) => a.name.localeCompare(b.name));
    saveReorderedShortcuts(sorted.map(s => s.id));
  });
}

if (btnSortCat) {
  btnSortCat.addEventListener('click', () => {
    vibrate(20);
    const catPriority = { 'Streaming': 1, 'Media': 2, 'Games': 3, 'System': 4 };
    const sorted = [...shortcutsList].sort((a, b) => {
      const pA = catPriority[a.category] || 9;
      const pB = catPriority[b.category] || 9;
      if (pA !== pB) return pA - pB;
      return a.name.localeCompare(b.name);
    });
    saveReorderedShortcuts(sorted.map(s => s.id));
  });
}

// ----------------- App Catalog & 1-Click Installer -----------------
let appCatalog = [];
let activeCatalogFilter = 'All';
let catalogSearchQuery = '';

const addModal = document.getElementById('add-modal');
const btnOpenAddSc = document.getElementById('btn-open-add-sc');
const btnCloseAddModal = document.getElementById('btn-close-add-modal');
const catSearchInput = document.getElementById('cat-search-input');
const catalogListEl = document.getElementById('catalog-list');
const customAppForm = document.getElementById('custom-app-form');
const btnCancelCustom = document.getElementById('btn-cancel-custom');

async function loadCatalog() {
  try {
    const res = await fetch('/api/catalog');
    appCatalog = await res.json();
    renderCatalog();
  } catch (e) {
    console.error('Failed to load app catalog:', e);
  }
}

function renderCatalog() {
  if (!catalogListEl) return;
  catalogListEl.innerHTML = '';

  const query = catalogSearchQuery.toLowerCase();
  const filtered = appCatalog.filter(item => {
    const matchesCat = (activeCatalogFilter === 'All') || (item.category === activeCatalogFilter);
    const matchesSearch = !query || 
      item.name.toLowerCase().includes(query) || 
      (item.description && item.description.toLowerCase().includes(query)) ||
      (item.tag && item.tag.toLowerCase().includes(query));
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    catalogListEl.innerHTML = `
      <div style="text-align:center; padding:30px 10px; color:var(--text-muted); font-size:13px;">
        No apps found matching "${catalogSearchQuery}".<br>
        <button type="button" id="btn-switch-custom-suggest" style="margin-top:10px; background:var(--primary-color); color:white; border:none; padding:8px 16px; border-radius:12px; font-weight:700; cursor:pointer;">
          ➕ Add Custom App / URL
        </button>
      </div>
    `;
    const btnSwitch = document.getElementById('btn-switch-custom-suggest');
    if (btnSwitch) {
      btnSwitch.addEventListener('click', () => showCustomForm(true));
    }
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'cat-item-card';

    const isAdded = shortcutsList.some(s => s.target === item.target || s.name.toLowerCase() === item.name.toLowerCase());
    const firstLetter = (item.name || 'A')[0].toUpperCase();

    card.innerHTML = `
      <div class="cat-item-icon" style="background: ${item.color || 'var(--primary-color)'}">
        ${firstLetter}
      </div>
      <div class="cat-item-info">
        <div class="cat-item-header">
          <span class="cat-item-name">${item.name}</span>
          <span class="cat-item-tag ${item.no_login ? 'tag-free' : ''}">${item.tag || item.category}</span>
        </div>
        <div class="cat-item-desc" title="${item.description}">${item.description || ''}</div>
      </div>
      <div class="cat-item-action">
        ${isAdded 
          ? '<button type="button" class="btn-cat-add added" disabled>✓ Added</button>'
          : `<button type="button" class="btn-cat-add" data-app-id="${item.id}">➕ Add</button>`
        }
      </div>
    `;

    const addBtn = card.querySelector('.btn-cat-add:not(.added)');
    if (addBtn) {
      addBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        vibrate(30);
        addBtn.disabled = true;
        addBtn.textContent = 'Adding...';

        try {
          await fetch('/api/shortcuts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: item.name,
              target: item.target,
              type: item.type || 'url',
              category: item.category,
              color: item.color,
              icon: item.id
            })
          });

          addBtn.className = 'btn-cat-add added';
          addBtn.textContent = '✓ Added';
          loadShortcuts();
        } catch (err) {
          console.error('Failed to add shortcut:', err);
          addBtn.textContent = 'Error';
        }
      });
    }

    catalogListEl.appendChild(card);
  });
}

function showCustomForm(show) {
  if (customAppForm) customAppForm.style.display = show ? 'flex' : 'none';
  if (catalogListEl) catalogListEl.style.display = show ? 'none' : 'flex';
  const input = document.getElementById('cat-search-input');
  if (input) input.style.display = show ? 'none' : 'block';
}

if (btnOpenAddSc) {
  btnOpenAddSc.addEventListener('click', () => {
    vibrate(20);
    showCustomForm(false);
    document.querySelectorAll('.catalog-filter-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === 'All'));
    activeCatalogFilter = 'All';
    catalogSearchQuery = '';
    if (catSearchInput) catSearchInput.value = '';
    if (addModal) addModal.classList.add('open');
    loadCatalog();
  });
}

if (btnCloseAddModal) {
  btnCloseAddModal.addEventListener('click', () => {
    if (addModal) addModal.classList.remove('open');
  });
}

if (btnCancelCustom) {
  btnCancelCustom.addEventListener('click', () => {
    showCustomForm(false);
    document.querySelectorAll('.catalog-filter-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === 'All'));
    activeCatalogFilter = 'All';
    renderCatalog();
  });
}

document.querySelectorAll('.catalog-filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    vibrate(15);
    document.querySelectorAll('.catalog-filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    const cat = chip.dataset.cat;
    if (cat === 'custom') {
      showCustomForm(true);
    } else {
      showCustomForm(false);
      activeCatalogFilter = cat;
      renderCatalog();
    }
  });
});

if (catSearchInput) {
  catSearchInput.addEventListener('input', (e) => {
    catalogSearchQuery = e.target.value.trim();
    renderCatalog();
  });
}

const btnSaveSc = document.getElementById('btn-save-sc');
if (btnSaveSc) {
  btnSaveSc.addEventListener('click', async () => {
    const scName = document.getElementById('sc-name');
    const scTarget = document.getElementById('sc-target');
    const scCat = document.getElementById('sc-cat');
    const scColor = document.getElementById('sc-color');

    const name = scName ? scName.value.trim() : '';
    const target = scTarget ? scTarget.value.trim() : '';
    const category = scCat ? scCat.value : 'Streaming';
    const color = scColor ? scColor.value : 'linear-gradient(135deg, #6366f1, #4338ca)';

    if (!name || !target) {
      alert('Please enter a name and target URL or path.');
      return;
    }

    const payload = {
      name,
      target,
      category,
      color,
      type: (target.startsWith('http://') || target.startsWith('https://')) ? 'url' : 'app'
    };

    try {
      await fetch('/api/shortcuts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (addModal) addModal.classList.remove('open');
      if (scName) scName.value = '';
      if (scTarget) scTarget.value = '';
      loadShortcuts();
    } catch (e) {
      alert('Error saving shortcut');
    }
  });
}

// ----------------- Tab Navigation -----------------
const tabBtns = document.querySelectorAll('.tab-btn');
const viewPanels = document.querySelectorAll('.view-panel');

function switchRemoteTab(targetView) {
  tabBtns.forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === targetView);
  });
  viewPanels.forEach(p => {
    p.classList.toggle('active', p.id === `view-${targetView}`);
  });
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    vibrate(15);
    const targetView = btn.getAttribute('data-tab');
    switchRemoteTab(targetView);
  });
});

document.querySelectorAll('.btn-goto-apps').forEach(btn => {
  btn.addEventListener('click', () => {
    vibrate(25);
    switchRemoteTab('apps');
  });
});

// ----------------- Voice Control Engine -----------------
const btnVoice = document.getElementById('btn-voice');
const voiceModal = document.getElementById('voice-modal');
const voiceModalStatus = document.getElementById('voice-modal-status');
const voiceModalTranscript = document.getElementById('voice-modal-transcript');
const voiceCircle = document.getElementById('voice-circle');
const btnCancelVoice = document.getElementById('btn-cancel-voice');
const voiceCommandInput = document.getElementById('voice-command-input');
const btnSubmitVoice = document.getElementById('btn-submit-voice');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

const WORD_TO_NUMBER = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
  'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
  'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
  'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
  'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60,
  'seventy': 70, 'eighty': 80, 'ninety': 90, 'hundred': 100
};

const DEFAULT_APP_TARGETS = {
  'tubi': { name: 'Tubi', target: 'https://tubitv.com', type: 'url' },
  'pluto': { name: 'Pluto TV', target: 'https://pluto.tv', type: 'url' },
  'roku_channel': { name: 'The Roku Channel', target: 'https://therokuchannel.roku.com', type: 'url' },
  'plex_free': { name: 'Plex Free TV', target: 'https://watch.plex.tv', type: 'url' },
  'xumo': { name: 'Xumo Play', target: 'https://www.xumoplay.com', type: 'url' },
  'crackle': { name: 'Crackle', target: 'https://www.crackle.com', type: 'url' },
  'pbs': { name: 'PBS', target: 'https://www.pbs.org/livestream', type: 'url' },
  'freevee': { name: 'Amazon Freevee', target: 'https://www.amazon.com/freevee', type: 'url' },
  'hulu': { name: 'Hulu', target: 'https://www.hulu.com', type: 'url' },
  'prime': { name: 'Prime Video', target: 'https://www.amazon.com/gp/video/storefront', type: 'url' },
  'netflix': { name: 'Netflix', target: 'https://www.netflix.com', type: 'url' },
  'youtube': { name: 'YouTube', target: 'https://www.youtube.com', type: 'url' },
  'disney': { name: 'Disney+', target: 'https://www.disneyplus.com', type: 'url' },
  'max': { name: 'Max', target: 'https://play.max.com', type: 'url' },
  'twitch': { name: 'Twitch', target: 'https://www.twitch.tv', type: 'url' },
  'spotify': { name: 'Spotify', target: 'https://open.spotify.com', type: 'url' },
  'plex': { name: 'Plex', target: 'https://watch.plex.tv', type: 'url' },
  'steam': { name: 'Steam', target: 'steam://open/bigpicture', type: 'app' },
  'browser': { name: 'Browser', target: 'https://www.google.com', type: 'url' }
};

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isListening = true;
    if (voiceModal) voiceModal.classList.add('open');
    if (voiceCircle) voiceCircle.classList.add('pulse');
    if (voiceModalStatus) voiceModalStatus.textContent = 'Listening...';
    if (voiceModalTranscript) {
      voiceModalTranscript.className = 'voice-modal-transcript';
      voiceModalTranscript.textContent = 'Speak command: "Hulu", "Volume 10", etc.';
    }
    vibrate(35);
  };

  recognition.onresult = (event) => {
    let interim = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }

    const currentText = (finalTranscript || interim).trim();
    if (voiceModalTranscript && currentText) {
      voiceModalTranscript.className = 'voice-modal-transcript recognized';
      voiceModalTranscript.textContent = `"${currentText}"`;
    }
    if (voiceCommandInput && currentText) {
      voiceCommandInput.value = currentText;
    }

    if (finalTranscript) {
      vibrate(25);
      processVoiceCommand(finalTranscript);
    }
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    if (voiceCircle) voiceCircle.classList.remove('pulse');
    if (voiceModalStatus) voiceModalStatus.textContent = '⚠️ Speech Error';
    if (voiceModalTranscript) {
      if (event.error === 'not-allowed') {
        voiceModalTranscript.textContent = 'Microphone permission needed. Tap "Allow" in Chrome.';
      } else if (event.error === 'network') {
        voiceModalTranscript.textContent = 'Chrome cloud speech blocked. Use keyboard mic below!';
      } else {
        voiceModalTranscript.textContent = `Error: ${event.error}. Use input box below.`;
      }
    }
  };

  recognition.onend = () => {
    isListening = false;
    if (voiceCircle) voiceCircle.classList.remove('pulse');
  };
}

if (btnVoice) {
  btnVoice.addEventListener('click', () => {
    if (voiceModal) voiceModal.classList.add('open');
    if (voiceCommandInput) {
      voiceCommandInput.value = '';
      setTimeout(() => voiceCommandInput.focus(), 150);
    }

    if (SpeechRecognition) {
      if (isListening) {
        recognition.stop();
      } else {
        try {
          recognition.start();
        } catch (e) {
          console.error('Error starting recognition:', e);
        }
      }
    }
  });
}

if (btnCancelVoice) {
  btnCancelVoice.addEventListener('click', () => {
    if (recognition && isListening) recognition.stop();
    if (voiceModal) voiceModal.classList.remove('open');
    vibrate(15);
  });
}

if (btnSubmitVoice && voiceCommandInput) {
  btnSubmitVoice.addEventListener('click', () => {
    const val = voiceCommandInput.value.trim();
    if (val) {
      processVoiceCommand(val);
    }
  });

  voiceCommandInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = voiceCommandInput.value.trim();
      if (val) {
        processVoiceCommand(val);
      }
    }
  });
}

// Quick voice hint pills
document.querySelectorAll('.hint-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    const cmd = pill.getAttribute('data-voice-cmd');
    if (cmd) {
      vibrate(20);
      processVoiceCommand(cmd);
    }
  });
});

function showVoiceSuccess(actionMessage) {
  if (voiceModalStatus) voiceModalStatus.textContent = '✅ Success';
  if (voiceModalTranscript) {
    voiceModalTranscript.className = 'voice-modal-transcript success';
    voiceModalTranscript.textContent = actionMessage;
  }
  vibrate(50);
  setTimeout(() => {
    if (voiceModal) voiceModal.classList.remove('open');
    if (voiceCommandInput) voiceCommandInput.blur();
  }, 1200);
}

function processVoiceCommand(raw) {
  const text = raw.toLowerCase().trim();
  console.log('Processing voice command:', text);

  // 1. Mode Switching
  if (text === 'pc' || text.includes('pc mode') || text.includes('desktop') || text.includes('switch to pc') || text.includes('windows')) {
    document.getElementById('btn-mode-pc').click();
    showVoiceSuccess('Switched to PC Desktop Mode');
    return;
  }
  if (text === 'tv' || text.includes('tv mode') || text.includes('switch to tv')) {
    document.getElementById('btn-mode-tv').click();
    showVoiceSuccess('Switched to TV Launcher Mode');
    return;
  }

  // 2. Volume Commands (Scale 1 to 20 = 1% to 100%)
  if (text.includes('mute') || text.includes('unmute')) {
    muteBtn.click();
    showVoiceSuccess(isMuted ? 'Muted PC Audio' : 'Unmuted PC Audio');
    return;
  }
  if (text.includes('volume up') || text.includes('louder') || text.includes('turn it up')) {
    const newVol = Math.min(100, currentVolume + 5);
    volSlider.value = newVol;
    volVal.textContent = `${newVol}%`;
    sendWS({ type: 'set_volume', value: newVol });
    const lvl = Math.round(newVol / 5);
    showVoiceSuccess(`Volume Up → Level ${lvl} (${newVol}%)`);
    return;
  }
  if (text.includes('volume down') || text.includes('softer') || text.includes('lower') || text.includes('turn it down')) {
    const newVol = Math.max(0, currentVolume - 5);
    volSlider.value = newVol;
    volVal.textContent = `${newVol}%`;
    sendWS({ type: 'set_volume', value: newVol });
    const lvl = Math.round(newVol / 5);
    showVoiceSuccess(`Volume Down → Level ${lvl} (${newVol}%)`);
    return;
  }

  // Check Volume Level (supports digits and word numbers, 1-20 scale)
  const volPattern = /(?:volume|vol|level)\s*(?:level|to)?\s*([a-z0-9\-]+)/i;
  const volMatch = text.match(volPattern);
  if (volMatch) {
    const matchedToken = volMatch[1].trim();
    let num = parseInt(matchedToken, 10);
    if (isNaN(num)) {
      num = WORD_TO_NUMBER[matchedToken];
    }

    if (num !== undefined && num !== null && !isNaN(num)) {
      let actualPercent;
      let levelDisplay;

      if (num <= 20) {
        // 1 - 20 scale (1 = 5%, 10 = 50%, 20 = 100%)
        actualPercent = Math.min(100, Math.max(0, num * 5));
        levelDisplay = `Level ${num} (${actualPercent}%)`;
      } else {
        // Direct percentage if user said "volume 75"
        actualPercent = Math.min(100, Math.max(0, num));
        levelDisplay = `${actualPercent}%`;
      }

      volSlider.value = actualPercent;
      volVal.textContent = `${actualPercent}%`;
      sendWS({ type: 'set_volume', value: actualPercent });
      showVoiceSuccess(`Volume set to ${levelDisplay}`);
      return;
    }
  }

  // 3. Media Controls
  if (text.includes('play') || text.includes('pause') || text.includes('resume')) {
    sendWS({ type: 'key_press', key: 'media_play_pause' });
    showVoiceSuccess('Play / Pause');
    return;
  }
  if (text.includes('next') || text.includes('skip')) {
    sendWS({ type: 'key_press', key: 'media_next' });
    showVoiceSuccess('Next Track');
    return;
  }
  if (text.includes('previous') || text.includes('rewind') || text.includes('back ten') || text.includes('back 10')) {
    sendWS({ type: 'key_press', key: 'left' });
    showVoiceSuccess('Rewind 10s');
    return;
  }
  if (text.includes('close app') || text.includes('close window') || text.includes('exit app')) {
    sendWS({ type: 'hotkey', combo: 'alt_f4' });
    showVoiceSuccess('Closed Application');
    return;
  }

  // 4. App Shortcuts (Matches "hulu", "prime", "netflix", etc.)
  const APP_ALIASES = [
    { keys: ['tubi', '2b', 'toobi'], id: 'tubi', name: 'Tubi' },
    { keys: ['pluto', 'pluto tv'], id: 'pluto', name: 'Pluto TV' },
    { keys: ['roku', 'roku channel'], id: 'roku_channel', name: 'The Roku Channel' },
    { keys: ['plex', 'plex free'], id: 'plex_free', name: 'Plex Free TV' },
    { keys: ['xumo', 'zumo', 'xumo play'], id: 'xumo', name: 'Xumo Play' },
    { keys: ['crackle'], id: 'crackle', name: 'Crackle' },
    { keys: ['pbs', 'pbs kids'], id: 'pbs', name: 'PBS' },
    { keys: ['freevee', 'free vee'], id: 'freevee', name: 'Amazon Freevee' },
    { keys: ['hulu'], id: 'hulu', name: 'Hulu' },
    { keys: ['prime', 'amazon', 'amazon prime', 'prime video'], id: 'prime', name: 'Prime Video' },
    { keys: ['netflix'], id: 'netflix', name: 'Netflix' },
    { keys: ['youtube', 'you tube'], id: 'youtube', name: 'YouTube' },
    { keys: ['disney', 'disney plus', 'disney+'], id: 'disney', name: 'Disney+' },
    { keys: ['max', 'hbo', 'hbo max'], id: 'max', name: 'Max' },
    { keys: ['twitch'], id: 'twitch', name: 'Twitch' },
    { keys: ['spotify'], id: 'spotify', name: 'Spotify' },
    { keys: ['steam', 'big picture'], id: 'steam', name: 'Steam' },
    { keys: ['browser', 'google', 'internet', 'chrome'], id: 'browser', name: 'Web Browser' }
  ];

  for (const alias of APP_ALIASES) {
    for (const k of alias.keys) {
      if (text === k || text === `open ${k}` || text === `launch ${k}` || text.includes(k)) {
        // Try dynamic shortcut first
        let target = null;
        let lType = 'url';
        const found = shortcutsList.find(s => s.id === alias.id || s.name.toLowerCase().includes(k));
        if (found) {
          target = found.target;
          lType = found.type || 'url';
        } else if (DEFAULT_APP_TARGETS[alias.id]) {
          target = DEFAULT_APP_TARGETS[alias.id].target;
          lType = DEFAULT_APP_TARGETS[alias.id].type;
        }

        if (target) {
          sendWS({ type: 'launch', target: target, launch_type: lType });
          if (quickBackBar) quickBackBar.classList.add('active');
          showVoiceSuccess(`Launching ${alias.name}...`);
          return;
        }
      }
    }
  }

  // Check any custom shortcuts in shortcutsList
  for (const app of shortcutsList) {
    const appName = app.name.toLowerCase();
    if (text === appName || text === `open ${appName}` || text.includes(appName)) {
      sendWS({ type: 'launch', target: app.target, launch_type: app.type || 'url' });
      if (quickBackBar) quickBackBar.classList.add('active');
      showVoiceSuccess(`Launching ${app.name}...`);
      return;
    }
  }

  // 5. Fallback: Type spoken query directly on PC
  let toType = raw;
  if (toType.toLowerCase().startsWith('type ')) toType = toType.substring(5);
  if (toType.toLowerCase().startsWith('search for ')) toType = toType.substring(11);
  sendWS({ type: 'type_text', text: toType });
  showVoiceSuccess(`Typed: "${toType}" on PC`);
}

// ----------------- Gyroscope & Air Mouse -----------------
const btnGyroToggle = document.getElementById('btn-gyro-toggle');
const btnAirTrigger = document.getElementById('btn-air-trigger');
const btnSwitchHttps = document.getElementById('btn-switch-https');
const gyroStatusBar = document.getElementById('gyro-status-bar');
const gyroStatusText = document.getElementById('gyro-status-text');

// Tuning elements
const btnSwapAxes = document.getElementById('btn-swap-axes');
const btnInvY = document.getElementById('btn-inv-y');
const btnInvX = document.getElementById('btn-inv-x');
const btnSensDown = document.getElementById('btn-sens-down');
const btnSensUp = document.getElementById('btn-sens-up');
const sensLabel = document.getElementById('sens-label');

let isGyroTracking = false;
let isTriggerHeld = false;
let gyroEventCount = 0;

// User Calibration (persisted in localStorage)
let gyroSwap = localStorage.getItem('couch_gyro_swap') === 'true';
let gyroInvY = localStorage.getItem('couch_gyro_invy') === 'true';
let gyroInvX = localStorage.getItem('couch_gyro_invx') === 'true';
let gyroSens = parseFloat(localStorage.getItem('couch_gyro_sens')) || 1.5;

function updateTuningUI() {
  if (btnSwapAxes) btnSwapAxes.classList.toggle('active', gyroSwap);
  if (btnInvY) btnInvY.classList.toggle('active', gyroInvY);
  if (btnInvX) btnInvX.classList.toggle('active', gyroInvX);
  if (sensLabel) sensLabel.textContent = `${gyroSens.toFixed(1)}x`;
}
updateTuningUI();

if (btnSwapAxes) {
  btnSwapAxes.addEventListener('click', () => {
    gyroSwap = !gyroSwap;
    localStorage.setItem('couch_gyro_swap', gyroSwap);
    updateTuningUI();
    vibrate(15);
  });
}

if (btnInvY) {
  btnInvY.addEventListener('click', () => {
    gyroInvY = !gyroInvY;
    localStorage.setItem('couch_gyro_invy', gyroInvY);
    updateTuningUI();
    vibrate(15);
  });
}

if (btnInvX) {
  btnInvX.addEventListener('click', () => {
    gyroInvX = !gyroInvX;
    localStorage.setItem('couch_gyro_invx', gyroInvX);
    updateTuningUI();
    vibrate(15);
  });
}

if (btnSensDown) {
  btnSensDown.addEventListener('click', () => {
    gyroSens = Math.max(0.5, Math.round((gyroSens - 0.2) * 10) / 10);
    localStorage.setItem('couch_gyro_sens', gyroSens);
    updateTuningUI();
    vibrate(15);
  });
}

if (btnSensUp) {
  btnSensUp.addEventListener('click', () => {
    gyroSens = Math.min(4.0, Math.round((gyroSens + 0.2) * 10) / 10);
    localStorage.setItem('couch_gyro_sens', gyroSens);
    updateTuningUI();
    vibrate(15);
  });
}

let lastAlpha = null;
let lastBeta = null;

if (btnSwitchHttps) {
  const navigateToHttps = (e) => {
    if (e) e.preventDefault();
    vibrate(30);
    const host = window.location.hostname;
    window.location.href = `https://${host}:5443/remote`;
  };
  btnSwitchHttps.addEventListener('click', navigateToHttps);
  btnSwitchHttps.addEventListener('touchend', navigateToHttps);
}

// Air Mouse Trigger: "HOLD TO MOVE AIR MOUSE"
if (btnAirTrigger) {
  btnAirTrigger.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!window.isSecureContext && window.location.protocol !== 'https:') {
      const host = window.location.hostname;
      const targetHttps = `https://${host}:5443/remote`;
      if (confirm('Android Chrome requires HTTPS for Air Mouse sensors.\n\nTap OK to switch to HTTPS.')) {
        window.location.href = targetHttps;
      }
      return;
    }
    vibrate(25);
    isTriggerHeld = true;
    btnAirTrigger.classList.add('active');
    startSensorListening();
  }, { passive: false });

  btnAirTrigger.addEventListener('touchend', (e) => {
    e.preventDefault();
    isTriggerHeld = false;
    btnAirTrigger.classList.remove('active');
    if (!isGyroTracking) {
      stopSensorListening();
    }
  }, { passive: false });
}

// Continuous Gyro Toggle
if (btnGyroToggle) {
  btnGyroToggle.addEventListener('click', async () => {
    vibrate(30);

    // Check secure context
    if (!window.isSecureContext && window.location.protocol !== 'https:') {
      const host = window.location.hostname;
      const targetHttps = `https://${host}:5443/remote`;
      const shouldSwitch = confirm(
        'Android Chrome requires HTTPS to allow Gyroscope / Air Mouse motion sensors.\n\n' +
        'Tap OK to switch to the secure HTTPS connection now.'
      );
      if (shouldSwitch) {
        window.location.href = targetHttps;
      }
      return;
    }

    // iOS 13+ permission request if needed
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const resp = await DeviceOrientationEvent.requestPermission();
        if (resp !== 'granted') {
          alert('Gyroscope permission denied.');
          return;
        }
      } catch (err) {
        console.error(err);
      }
    }

    isGyroTracking = !isGyroTracking;
    if (isGyroTracking) {
      btnGyroToggle.classList.add('active');
      btnGyroToggle.textContent = '🎯 Gyro On';
      startSensorListening();
    } else {
      btnGyroToggle.classList.remove('active');
      btnGyroToggle.textContent = '🎯 Gyro';
      if (!isTriggerHeld) {
        stopSensorListening();
      }
    }
  });
}

function startSensorListening() {
  lastAlpha = null;
  lastBeta = null;
  gyroEventCount = 0;
  window.addEventListener('devicemotion', handleDeviceMotion);
  window.addEventListener('deviceorientation', handleOrientation);

  gyroStatusText.textContent = '🎯 Aim phone at TV';
  gyroStatusBar.style.borderColor = 'var(--accent-color)';

  setTimeout(() => {
    if (gyroEventCount === 0 && (isGyroTracking || isTriggerHeld)) {
      if (!window.isSecureContext) {
        gyroStatusText.textContent = '⚠️ Sensors blocked by HTTP. Use HTTPS link above!';
        gyroStatusBar.style.borderColor = 'var(--danger-color)';
      }
    }
  }, 1200);
}

function stopSensorListening() {
  window.removeEventListener('devicemotion', handleDeviceMotion);
  window.removeEventListener('deviceorientation', handleOrientation);
  gyroStatusText.textContent = '🎯 Gyroscope ready';
  gyroStatusBar.style.borderColor = 'var(--border-color)';
}

function dispatchAirMove(rawDx, rawDy) {
  let dx = rawDx;
  let dy = rawDy;

  // Swap axes if requested
  if (gyroSwap) {
    const tmp = dx;
    dx = dy;
    dy = tmp;
  }

  // Invert directions if requested
  if (gyroInvX) dx = -dx;
  if (gyroInvY) dy = -dy;

  // Apply sensitivity
  dx = Math.round(dx * gyroSens);
  dy = Math.round(dy * gyroSens);

  if (dx !== 0 || dy !== 0) {
    sendWS({ type: 'mouse_move', dx: dx, dy: dy });
    gyroStatusText.textContent = `🎯 X: ${dx}, Y: ${dy}`;
  }
}

// Handler 1: DeviceMotion rotationRate
function handleDeviceMotion(e) {
  if (!isGyroTracking && !isTriggerHeld) return;
  gyroEventCount++;

  if (e.rotationRate) {
    // When holding phone in front pointing at TV:
    // Panning left/right is yaw (alpha)
    // Pitching up/down is pitch (beta)
    const yaw = e.rotationRate.alpha;
    const pitch = e.rotationRate.beta;

    if (yaw !== null && pitch !== null) {
      if (Math.abs(yaw) < 1.5 && Math.abs(pitch) < 1.5) return;

      // Panning left -> dx < 0; Panning right -> dx > 0
      // Pitching up -> dy < 0; Pitching down -> dy > 0
      const rawDx = Math.round(yaw * -0.9);
      const rawDy = Math.round(pitch * -0.9);

      dispatchAirMove(rawDx, rawDy);
    }
  }
}

// Handler 2: DeviceOrientation Fallback
function handleOrientation(e) {
  if (!isGyroTracking && !isTriggerHeld) return;
  gyroEventCount++;

  const alpha = e.alpha;
  const beta = e.beta;

  if (lastAlpha === null || lastBeta === null) {
    lastAlpha = alpha;
    lastBeta = beta;
    return;
  }

  let dAlpha = alpha - lastAlpha;
  let dBeta = beta - lastBeta;

  lastAlpha = alpha;
  lastBeta = beta;

  // Handle 360 wrap around for alpha (compass yaw)
  if (dAlpha > 180) dAlpha -= 360;
  if (dAlpha < -180) dAlpha += 360;

  // Filter tiny hand jitter
  if (Math.abs(dAlpha) < 0.25 && Math.abs(dBeta) < 0.25) return;

  // Panning right increases alpha -> moves mouse right (dx > 0)
  // Tilting up lowers beta -> moves mouse up (dy < 0)
  const rawDx = Math.round(dAlpha * 3.8);
  const rawDy = Math.round(dBeta * 3.8);

  dispatchAirMove(rawDx, rawDy);
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
});
