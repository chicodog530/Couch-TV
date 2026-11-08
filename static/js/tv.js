// CouchPC 10-Foot TV Launcher Script

let shortcuts = [];
let focusedIndex = 0;
let isTvEditMode = false;
let selectedTvPresetColor = '';

// Update Live Clock
function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  const clockEl = document.getElementById('tv-clock');
  const dateEl = document.getElementById('tv-date');
  if (clockEl) clockEl.textContent = timeStr;
  if (dateEl) dateEl.textContent = dateStr;
}

// Fetch and Render Shortcuts
async function loadTvShortcuts() {
  try {
    const res = await fetch('/api/shortcuts');
    shortcuts = await res.json();
    renderTvGrid();
  } catch (e) {
    console.error('Failed to load shortcuts for TV:', e);
  }
}

async function moveTvShortcut(id, direction) {
  const currentIndex = shortcuts.findIndex(s => s.id === id);
  if (currentIndex === -1) return;

  const newOrder = [...shortcuts];
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

  shortcuts = newOrder;
  renderTvGrid();

  try {
    const res = await fetch('/api/shortcuts/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: newOrder.map(s => s.id) })
    });
    const data = await res.json();
    if (data.shortcuts) {
      shortcuts = data.shortcuts;
      renderTvGrid();
    }
  } catch (e) {
    console.error('Failed to save TV reordered shortcuts:', e);
  }
}

async function deleteTvShortcut(id, name) {
  if (confirm(`Delete "${name}" shortcut?`)) {
    try {
      await fetch(`/api/shortcuts/${id}`, { method: 'DELETE' });
      loadTvShortcuts();
    } catch (e) {
      console.error('Failed to delete shortcut on TV:', e);
    }
  }
}

function renderTvGrid() {
  const grid = document.getElementById('tv-grid');
  grid.innerHTML = '';

  shortcuts.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = `tv-card ${index === focusedIndex ? 'focused' : ''} ${isTvEditMode ? 'tv-edit-active' : ''}`;
    card.tabIndex = 0;
    card.dataset.index = index;

    const firstLetter = (item.name || 'A')[0].toUpperCase();

    let editHtml = '';
    if (isTvEditMode) {
      editHtml = `
        <button type="button" class="tv-card-del-btn" data-del-id="${item.id}" title="Delete Shortcut">✕</button>
        <div class="tv-card-reorder-bar">
          <button type="button" class="tv-btn-reorder btn-tv-move" data-move-id="${item.id}" data-dir="left" title="Move Left">◀</button>
          <button type="button" class="tv-btn-reorder btn-tv-move" data-move-id="${item.id}" data-dir="top" title="Move to Top">🔝</button>
          <button type="button" class="tv-btn-reorder btn-tv-move" data-move-id="${item.id}" data-dir="right" title="Move Right">▶</button>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="tv-card-icon" style="background: ${item.color || 'var(--tv-primary)'}">
        ${firstLetter}
      </div>
      <div class="tv-card-title">${item.name}</div>
      <div class="tv-card-badge">${item.category || 'App'}</div>
      ${editHtml}
    `;

    card.addEventListener('click', (e) => {
      if (isTvEditMode) return;
      launchItem(item);
    });

    if (isTvEditMode) {
      const delBtn = card.querySelector('.tv-card-del-btn');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteTvShortcut(item.id, item.name);
        });
      }

      card.querySelectorAll('.btn-tv-move').forEach(mBtn => {
        mBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const sid = mBtn.dataset.moveId;
          const dir = mBtn.dataset.dir;
          moveTvShortcut(sid, dir);
        });
      });
    }

    card.addEventListener('mouseenter', () => {
      focusedIndex = index;
    });

    grid.appendChild(card);
  });
}

function setFocusedIndex(newIndex, shouldScroll = false) {
  if (shortcuts.length === 0) return;
  const cards = document.querySelectorAll('.tv-card');
  if (cards[focusedIndex]) cards[focusedIndex].classList.remove('focused');
  focusedIndex = (newIndex + shortcuts.length) % shortcuts.length;
  if (cards[focusedIndex]) {
    cards[focusedIndex].classList.add('focused');
    if (shouldScroll) {
      cards[focusedIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

async function launchItem(item) {
  try {
    await fetch('/api/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: item.target,
        launch_type: item.type || 'url'
      })
    });
  } catch (e) {
    console.error('Error launching item:', e);
  }
}

// Switch to PC Desktop
async function switchToPcMode() {
  try {
    await fetch('/api/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'pc_mode', launch_type: 'action' })
    });
  } catch (e) {
    console.error('Error switching to PC mode:', e);
  }
}

// Background Wallpaper Switcher
const bgModal = document.getElementById('bg-modal');
const btnOpenBgModal = document.getElementById('btn-open-bg-picker');
const btnCloseBgModal = document.getElementById('btn-close-bg-modal');

if (btnOpenBgModal) {
  btnOpenBgModal.addEventListener('click', () => {
    bgModal.classList.add('open');
  });
}

if (btnCloseBgModal) {
  btnCloseBgModal.addEventListener('click', () => {
    bgModal.classList.remove('open');
  });
}

document.querySelectorAll('.bg-thumb-card').forEach(card => {
  card.addEventListener('click', async () => {
    const wpUrl = card.getAttribute('data-wp-url');
    document.body.style.backgroundImage = `url('${wpUrl}')`;

    document.querySelectorAll('.bg-thumb-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    // Persist to server
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background: wpUrl })
      });
    } catch (e) {
      console.error('Failed to save background:', e);
    }

    setTimeout(() => {
      bgModal.classList.remove('open');
    }, 250);
  });
});

// Keyboard Navigation for Couch / D-Pad
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'F11') {
    e.preventDefault();
    switchToPcMode();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    setFocusedIndex(focusedIndex + 1, true);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    setFocusedIndex(focusedIndex - 1, true);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setFocusedIndex(focusedIndex + 3, true);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setFocusedIndex(focusedIndex - 3, true);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (shortcuts[focusedIndex]) {
      launchItem(shortcuts[focusedIndex]);
    }
  }
});

// Setup PC Mode buttons
document.getElementById('btn-pc-mode').addEventListener('click', switchToPcMode);
const bannerPcBtn = document.getElementById('btn-banner-pc');
if (bannerPcBtn) bannerPcBtn.addEventListener('click', switchToPcMode);

// Setup TV Edit Mode & Add App
const btnTvEdit = document.getElementById('btn-tv-edit-mode');
if (btnTvEdit) {
  btnTvEdit.addEventListener('click', () => {
    isTvEditMode = !isTvEditMode;
    btnTvEdit.classList.toggle('active', isTvEditMode);
    btnTvEdit.textContent = isTvEditMode ? '✓ Done Editing' : '✏️ Edit & Sort Tiles';
    renderTvGrid();
  });
}

// TV App Catalog & 1-Click Installer
let tvAppCatalog = [];
let activeTvCatalogFilter = 'All';
let tvCatalogSearchQuery = '';

const tvAddModal = document.getElementById('tv-add-modal');
const btnTvAddApp = document.getElementById('btn-tv-add-app');
const btnCloseTvAddModal = document.getElementById('btn-close-tv-add-modal');
const tvCatSearchInput = document.getElementById('tv-cat-search');
const tvCatalogListEl = document.getElementById('tv-catalog-list');
const tvCustomForm = document.getElementById('tv-custom-form');
const btnCancelTvCustom = document.getElementById('btn-cancel-tv-custom');
const btnSaveTvSc = document.getElementById('btn-save-tv-sc');

async function loadTvCatalog() {
  try {
    const res = await fetch('/api/catalog');
    tvAppCatalog = await res.json();
    renderTvCatalog();
  } catch (e) {
    console.error('Failed to load TV catalog:', e);
  }
}

function renderTvCatalog() {
  if (!tvCatalogListEl) return;
  tvCatalogListEl.innerHTML = '';

  const query = tvCatalogSearchQuery.toLowerCase();
  const filtered = tvAppCatalog.filter(item => {
    const matchesCat = (activeTvCatalogFilter === 'All') || (item.category === activeTvCatalogFilter);
    const matchesSearch = !query || 
      item.name.toLowerCase().includes(query) || 
      (item.description && item.description.toLowerCase().includes(query)) ||
      (item.tag && item.tag.toLowerCase().includes(query));
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    tvCatalogListEl.innerHTML = `
      <div style="text-align:center; padding:40px 10px; color:var(--tv-text-muted); font-size:15px;">
        No apps found matching "${tvCatalogSearchQuery}".<br>
        <button type="button" id="btn-tv-switch-custom" style="margin-top:14px; background:var(--tv-accent); color:#0f172a; border:none; padding:10px 22px; border-radius:14px; font-weight:800; cursor:pointer;">
          ➕ Add Custom App / URL
        </button>
      </div>
    `;
    const btnSwitch = document.getElementById('btn-tv-switch-custom');
    if (btnSwitch) {
      btnSwitch.addEventListener('click', () => showTvCustomForm(true));
    }
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'cat-item-card';

    const isAdded = shortcuts.some(s => s.target === item.target || s.name.toLowerCase() === item.name.toLowerCase());
    const firstLetter = (item.name || 'A')[0].toUpperCase();

    card.innerHTML = `
      <div class="cat-item-icon" style="background: ${item.color || 'var(--tv-primary)'}">
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
          loadTvShortcuts();
        } catch (err) {
          console.error('Failed to add shortcut on TV:', err);
          addBtn.textContent = 'Error';
        }
      });
    }

    tvCatalogListEl.appendChild(card);
  });
}

function showTvCustomForm(show) {
  if (tvCustomForm) tvCustomForm.style.display = show ? 'flex' : 'none';
  if (tvCatalogListEl) tvCatalogListEl.style.display = show ? 'none' : 'flex';
  const input = document.getElementById('tv-cat-search');
  if (input) input.style.display = show ? 'none' : 'block';
}

if (btnTvAddApp && tvAddModal) {
  btnTvAddApp.addEventListener('click', () => {
    showTvCustomForm(false);
    document.querySelectorAll('.tv-cat-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === 'All'));
    activeTvCatalogFilter = 'All';
    tvCatalogSearchQuery = '';
    if (tvCatSearchInput) tvCatSearchInput.value = '';
    tvAddModal.classList.add('open');
    loadTvCatalog();
  });
}

if (btnCloseTvAddModal && tvAddModal) {
  btnCloseTvAddModal.addEventListener('click', () => {
    tvAddModal.classList.remove('open');
  });
}

if (btnCancelTvCustom) {
  btnCancelTvCustom.addEventListener('click', () => {
    showTvCustomForm(false);
    document.querySelectorAll('.tv-cat-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === 'All'));
    activeTvCatalogFilter = 'All';
    renderTvCatalog();
  });
}

document.querySelectorAll('.tv-cat-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.tv-cat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    const cat = chip.dataset.cat;
    if (cat === 'custom') {
      showTvCustomForm(true);
    } else {
      showTvCustomForm(false);
      activeTvCatalogFilter = cat;
      renderTvCatalog();
    }
  });
});

if (tvCatSearchInput) {
  tvCatSearchInput.addEventListener('input', (e) => {
    tvCatalogSearchQuery = e.target.value.trim();
    renderTvCatalog();
  });
}

if (btnSaveTvSc) {
  btnSaveTvSc.addEventListener('click', async () => {
    const scName = document.getElementById('tv-sc-name');
    const scUrl = document.getElementById('tv-sc-url');
    const scCat = document.getElementById('tv-sc-cat');
    const name = scName ? scName.value.trim() : '';
    const url = scUrl ? scUrl.value.trim() : '';
    const cat = scCat ? scCat.value : 'Streaming';

    if (!name || !url) {
      alert('Please enter an app name and URL or path.');
      return;
    }

    try {
      await fetch('/api/shortcuts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          target: url,
          type: url.startsWith('http') ? 'url' : 'app',
          category: cat,
          color: 'linear-gradient(135deg, #6366f1, #3b82f6)'
        })
      });

      if (scName) scName.value = '';
      if (scUrl) scUrl.value = '';
      if (tvAddModal) tvAddModal.classList.remove('open');
      loadTvShortcuts();
    } catch (e) {
      console.error('Failed to add shortcut on TV:', e);
    }
  });
}

// Real-time WebSocket sync for TV screen
function initTvWebSocket() {
  const wsHost = window.location.hostname || '127.0.0.1';
  const wsUrl = `ws://${wsHost}:5001`;

  const ws = new WebSocket(wsUrl);
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'shortcuts_updated' && msg.shortcuts) {
        shortcuts = msg.shortcuts;
        renderTvGrid();
      } else if (msg.type === 'settings_updated' && msg.settings && msg.settings.background) {
        document.body.style.backgroundImage = `url('${msg.settings.background}')`;
      }
    } catch (e) {
      console.error('TV WS error:', e);
    }
  };

  ws.onclose = () => {
    setTimeout(initTvWebSocket, 2000);
  };
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  updateClock();
  setInterval(updateClock, 1000);
  loadTvShortcuts();
  initTvWebSocket();
});
