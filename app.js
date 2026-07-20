/**
 * app.js
 * Core application controller for Ari Reminds (Multi-Reminder Profile Version).
 * Handles task management, multiple schedules, IndexedDB media isolated caching,
 * clocks scheduler, config drawers, and Electron IPC integrations.
 */

// Electron environment check
const isElectron = typeof require !== 'undefined' && require('electron');
const ipcRenderer = isElectron ? require('electron').ipcRenderer : null;

// Global App State
const state = {
  tasks: [],
  reminders: [],
  editingReminder: null, // Pointer to currently editing reminder object
  schedulerTimerId: null,
  activeTab: 'dashboard',
  emulator: {
    activeState: 'idle',
    instance: null,
    timerId: null
  }
};

// ----------------------------------------------------
// INDEXEDDB VIDEO STORAGE SYSTEM
// ----------------------------------------------------
const DB_NAME = 'AriVideosDB';
const STORE_NAME = 'videos';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveVideoBlob(key, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, key);
    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getVideoBlob(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = (e) => resolve(e.target.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function deleteVideoBlob(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

// ----------------------------------------------------
// LOCALSTORAGE TASKS MANAGER
// ----------------------------------------------------
function loadTasks() {
  const data = localStorage.getItem('ari_tasks');
  state.tasks = data ? JSON.parse(data) : [];
  updateTaskDOM();
  updateProgressStats();
}

function saveTasks() {
  localStorage.setItem('ari_tasks', JSON.stringify(state.tasks));
  updateProgressStats();
}

function addTask(text) {
  if (!text.trim()) return;
  const newTask = {
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    text: text.trim(),
    completed: false,
    createdAt: new Date().toISOString()
  };
  state.tasks.push(newTask);
  saveTasks();
  updateTaskDOM();
}

function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (task) {
    task.completed = !task.completed;
    saveTasks();
    updateProgressStats();
  }
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveTasks();
  updateTaskDOM();
}

function updateTaskDOM() {
  const listContainer = document.getElementById('task-list-container');
  const emptyState = document.getElementById('tasks-empty-state');
  
  const items = listContainer.querySelectorAll('.task-item');
  items.forEach(item => item.remove());
  
  if (state.tasks.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';
  const sortedTasks = [...state.tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  
  sortedTasks.forEach(task => {
    const item = document.createElement('div');
    item.className = 'task-item';
    item.dataset.id = task.id;
    
    item.innerHTML = `
      <label class="task-checkbox-label">
        <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
        <span class="task-text">${escapeHTML(task.text)}</span>
      </label>
      <button class="btn-delete-task" title="Delete Task">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;
    
    const checkbox = item.querySelector('.task-checkbox');
    checkbox.addEventListener('change', () => {
      toggleTask(task.id);
      setTimeout(updateTaskDOM, 350);
    });
    
    const deleteBtn = item.querySelector('.btn-delete-task');
    deleteBtn.addEventListener('click', () => {
      item.style.opacity = '0';
      item.style.transform = 'translateX(-20px)';
      setTimeout(() => deleteTask(task.id), 250);
    });
    
    listContainer.appendChild(item);
  });
}

function updateProgressStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter(t => t.completed).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  document.getElementById('stat-pending-tasks').textContent = total - completed;
  document.getElementById('stat-completed-percent').textContent = percent + '%';
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// ----------------------------------------------------
// MULTI-REMINDER MANAGEMENT SYSTEM
// ----------------------------------------------------
function loadReminders() {
  const stored = localStorage.getItem('ari_reminders');
  if (stored) {
    try {
      state.reminders = JSON.parse(stored);
    } catch(e) {
      console.error("Failed loading reminders:", e);
      state.reminders = [];
    }
  } else {
    // Generate default profile if empty
    state.reminders = [
      {
        id: 'rem_default',
        title: 'Daily Review',
        time: '17:00',
        enabled: true,
        screenPosition: 'bottom-right',
        scale: 1.0,
        repeat: {
          type: 'none',
          additionalTimes: [],
          intervalValue: 1,
          intervalUnit: 'hours'
        },
        texts: {
          walkin: "Hey! Time for your daily goal check-in. Don't forget your tasks!",
          action: "Did you finish your tasks for today? Let's be honest!",
          success: "Oh that's good. I'm proud of you! Keep up the amazing work! 🥰",
          defer: "Okay, I'll come back to remind you again later. You can do it! 💪"
        },
        hasCombinedVideo: false,
        dividePoint1: 0.0,
        dividePoint2: 0.0
      }
    ];
    saveReminders();
  }
  renderReminders();
  updateStatusBannerGlobally();
}

function saveReminders() {
  localStorage.setItem('ari_reminders', JSON.stringify(state.reminders));
}

function renderReminders() {
  const grid = document.getElementById('reminders-grid-container');
  const emptyState = document.getElementById('reminders-empty-state');
  
  // Clear previous cards
  grid.innerHTML = '';
  
  if (state.reminders.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';
  
  state.reminders.forEach(reminder => {
    const card = document.createElement('div');
    card.className = `glass-card reminder-card ${reminder.enabled ? '' : 'disabled'}`;
    
    // Video status icons
    const videoLabel = reminder.hasCombinedVideo 
      ? '<span style="color:var(--secondary); font-size:0.75rem;"><i class="fa-solid fa-video"></i> Keyframe Video</span>'
      : '<span style="color:var(--success); font-size:0.75rem;"><i class="fa-solid fa-bezier-curve"></i> Fallback SVG</span>';

    // Repeat schedule label tag
    const repeat = reminder.repeat || { type: 'none' };
    let repeatLabel = '';
    if (repeat.type === 'specific') {
      const extraCount = repeat.additionalTimes ? repeat.additionalTimes.length : 0;
      repeatLabel = `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px; font-weight:normal;"><i class="fa-solid fa-arrows-spin"></i> ${1 + extraCount} times daily</div>`;
    } else if (repeat.type === 'interval') {
      repeatLabel = `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px; font-weight:normal;"><i class="fa-solid fa-hourglass-half"></i> Every ${repeat.intervalValue} ${repeat.intervalUnit}</div>`;
    } else {
      repeatLabel = `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px; font-weight:normal;"><i class="fa-regular fa-clock"></i> Once daily</div>`;
    }

    card.innerHTML = `
      <div class="reminder-card-body">
        <div class="reminder-card-header">
          <div>
            <div class="reminder-card-title">${escapeHTML(reminder.title)}</div>
            <div class="reminder-meta-row">
              <span><i class="fa-solid fa-map-pin"></i> ${reminder.screenPosition}</span>
              <span><i class="fa-solid fa-up-right-and-down-left-from-center"></i> ${reminder.scale.toFixed(1)}x</span>
            </div>
          </div>
          <div style="text-align: right;">
            <span class="reminder-time-badge">${reminder.time}</span>
            ${repeatLabel}
          </div>
        </div>
        <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
          ${videoLabel}
        </div>
      </div>
      
      <div class="reminder-card-footer">
        <label class="switch-container">
          <input type="checkbox" class="switch-input switch-enable-reminder" ${reminder.enabled ? 'checked' : ''}>
          <span class="switch-slider"></span>
        </label>
        
        <div class="reminder-actions">
          <button class="btn btn-secondary btn-mini btn-test-reminder" title="Test Play Reminder">
            <i class="fa-solid fa-play"></i>
          </button>
          <button class="btn btn-secondary btn-mini btn-edit-reminder" title="Edit Settings & Videos">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn btn-danger btn-mini btn-delete-reminder" title="Delete Reminder">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;
    
    // Bind Action Events
    // 1. Enabled switch toggle
    const toggle = card.querySelector('.switch-enable-reminder');
    toggle.addEventListener('change', () => {
      reminder.enabled = toggle.checked;
      saveReminders();
      renderReminders();
      updateStatusBannerGlobally();
    });

    // 2. Test Play Widget
    card.querySelector('.btn-test-reminder').addEventListener('click', () => {
      triggerWidgetWindow(reminder);
      runLocalSimulation(reminder);
    });

    // 3. Edit settings and videos
    card.querySelector('.btn-edit-reminder').addEventListener('click', () => {
      openConfigDrawer(reminder.id);
    });

    // 4. Delete reminder
    card.querySelector('.btn-delete-reminder').addEventListener('click', () => {
      if (confirm(`Are you sure you want to delete "${reminder.title}"?`)) {
        deleteReminder(reminder.id);
      }
    });

    grid.appendChild(card);
  });
}

async function deleteReminder(id) {
  // Clean up associated videos from DB
  await deleteVideoBlob(`${id}_walk-in`);
  await deleteVideoBlob(`${id}_action`);
  await deleteVideoBlob(`${id}_walk-out`);
  
  state.reminders = state.reminders.filter(r => r.id !== id);
  saveReminders();
  renderReminders();
  updateStatusBannerGlobally();
  showNotification('Deleted', 'Reminder profile deleted.');
}

function updateStatusBannerGlobally() {
  const activeCount = state.reminders.filter(r => r.enabled).length;
  const statusLbl = document.getElementById('mascot-active-lbl');
  
  if (isElectron) {
    statusLbl.textContent = `Mode: Desktop (Ari | ${activeCount} Active)`;
  } else {
    statusLbl.textContent = `Mode: Web Browser (${activeCount} Active)`;
  }
}

// ----------------------------------------------------
// CONFIGURATION SLIDE-OUT DRAWER ENGINE
// ----------------------------------------------------
async function openConfigDrawer(reminderId = null) {
  const drawer = document.getElementById('config-drawer');
  const overlay = document.getElementById('config-drawer-overlay');
  const form = document.getElementById('reminder-profile-form');
  const titleLabel = document.getElementById('drawer-title-label');
  
  form.reset();
  
  if (reminderId) {
    // Edit existing reminder
    const reminder = state.reminders.find(r => r.id === reminderId);
    if (!reminder) return;
    
    state.editingReminder = reminder;
    titleLabel.textContent = `Edit Profile: ${reminder.title}`;
    
    document.getElementById('cfg-reminder-id').value = reminder.id;
    document.getElementById('cfg-reminder-title').value = reminder.title;
    document.getElementById('cfg-reminder-time').value = reminder.time;
    document.getElementById('cfg-screen-position').value = reminder.screenPosition;
    document.getElementById('cfg-popup-scale').value = reminder.scale;
    document.getElementById('val-popup-scale').textContent = reminder.scale.toFixed(1) + 'x';
    
    document.getElementById('cfg-text-walkin').value = reminder.texts.walkin;
    document.getElementById('cfg-text-action').value = reminder.texts.action;
    document.getElementById('cfg-text-success').value = reminder.texts.success;
    document.getElementById('cfg-text-defer').value = reminder.texts.defer;
    
    // Load coordinates and toggle custom pos controls visibility
    const setupGrp = document.getElementById('custom-position-setup-grp');
    if (reminder.screenPosition === 'custom') {
      setupGrp.style.display = 'block';
    } else {
      setupGrp.style.display = 'none';
    }
    if (reminder.customX !== undefined && reminder.customY !== undefined) {
      document.getElementById('lbl-custom-coords').textContent = `Coordinates: X: ${reminder.customX}, Y: ${reminder.customY}`;
    } else {
      document.getElementById('lbl-custom-coords').textContent = 'Coordinates: X: Not Configured, Y: Not Configured';
    }

    // Load keyframe divide values
    document.getElementById('cfg-divide-1').value = reminder.dividePoint1 !== undefined ? reminder.dividePoint1 : 0.0;
    document.getElementById('cfg-divide-2').value = reminder.dividePoint2 !== undefined ? reminder.dividePoint2 : 0.0;

    // Load Repeat values
    const repeat = reminder.repeat || { type: 'none', additionalTimes: [], intervalValue: 1, intervalUnit: 'hours' };
    document.getElementById('cfg-reminder-repeat-type').value = repeat.type;
    
    const specContainer = document.getElementById('repeat-specific-container');
    const interContainer = document.getElementById('repeat-interval-container');
    const specList = document.getElementById('specific-times-list');
    specList.innerHTML = '';
    
    if (repeat.type === 'specific') {
      specContainer.style.display = 'block';
      interContainer.style.display = 'none';
      if (repeat.additionalTimes) {
        repeat.additionalTimes.forEach(t => addSpecificTimePicker(t));
      }
    } else if (repeat.type === 'interval') {
      specContainer.style.display = 'none';
      interContainer.style.display = 'block';
      document.getElementById('cfg-repeat-interval-value').value = repeat.intervalValue || 1;
      document.getElementById('cfg-repeat-interval-unit').value = repeat.intervalUnit || 'hours';
    } else {
      specContainer.style.display = 'none';
      interContainer.style.display = 'none';
    }

    // Load video slot previews
    await refreshDrawerVideoPreviews(reminder.id);
  } else {
    // Create new reminder
    const newId = 'rem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    state.editingReminder = {
      id: newId,
      title: '',
      time: '12:00',
      enabled: true,
      screenPosition: 'bottom-right',
      scale: 1.0,
      customX: undefined,
      customY: undefined,
      repeat: {
        type: 'none',
        additionalTimes: [],
        intervalValue: 1,
        intervalUnit: 'hours'
      },
      texts: {
        walkin: "Hey! Time for your daily goal check-in. Don't forget your tasks!",
        action: "Did you finish your tasks for today? Let's be honest!",
        success: "Oh that's good. I'm proud of you! Keep up the amazing work! 🥰",
        defer: "Okay, I'll come back to remind you again later. You can do it! 💪"
      },
      hasCombinedVideo: false,
      dividePoint1: 0.0,
      dividePoint2: 0.0
    };
    
    titleLabel.textContent = "Create Reminder Profile";
    document.getElementById('cfg-reminder-id').value = newId;
    document.getElementById('cfg-reminder-time').value = '12:00';
    document.getElementById('cfg-popup-scale').value = 1.0;
    document.getElementById('val-popup-scale').textContent = '1.0x';
    
    // Clear divide fields
    document.getElementById('cfg-divide-1').value = 0.0;
    document.getElementById('cfg-divide-2').value = 0.0;
    
    // Clear repeat settings
    document.getElementById('cfg-reminder-repeat-type').value = 'none';
    document.getElementById('repeat-specific-container').style.display = 'none';
    document.getElementById('repeat-interval-container').style.display = 'none';
    document.getElementById('specific-times-list').innerHTML = '';
    document.getElementById('cfg-repeat-interval-value').value = 1;
    document.getElementById('cfg-repeat-interval-unit').value = 'hours';
    
    document.getElementById('custom-position-setup-grp').style.display = 'none';
    document.getElementById('lbl-custom-coords').textContent = 'Coordinates: X: Not Configured, Y: Not Configured';
    
    // Clear uploader previews
    const zones = document.querySelectorAll('.upload-zone');
    zones.forEach(zone => {
      const preview = zone.querySelector('.upload-preview-container');
      const video = preview.querySelector('.preview-video');
      if (video.src) {
        URL.revokeObjectURL(video.src);
        video.src = '';
      }
      preview.classList.remove('has-video');
    });
  }
  
  drawer.classList.add('active');
  overlay.classList.add('active');
}

function closeConfigDrawer() {
  const drawer = document.getElementById('config-drawer');
  const overlay = document.getElementById('config-drawer-overlay');
  
  drawer.classList.remove('active');
  overlay.classList.remove('active');
  
  state.editingReminder = null;
}

async function refreshDrawerVideoPreviews(reminderId) {
  const zone = document.getElementById('zone-combined');
  const previewContainer = document.getElementById('trimmer-preview-container');
  const videoEl = document.getElementById('trimmer-video');
  
  // Revoke old URL if any
  if (videoEl.src) {
    URL.revokeObjectURL(videoEl.src);
    videoEl.src = '';
  }
  
  const blob = await getVideoBlob(`${reminderId}_combined`);
  if (blob) {
    const url = URL.createObjectURL(blob);
    videoEl.src = url;
    previewContainer.classList.add('has-video');
  } else {
    previewContainer.classList.remove('has-video');
  }
}

// Save profile settings submitted from form
function handleProfileFormSubmit(e) {
  e.preventDefault();
  
  const id = document.getElementById('cfg-reminder-id').value;
  const title = document.getElementById('cfg-reminder-title').value.trim();
  const time = document.getElementById('cfg-reminder-time').value;
  const screenPosition = document.getElementById('cfg-screen-position').value;
  const scale = parseFloat(document.getElementById('cfg-popup-scale').value);
  
  const texts = {
    walkin: document.getElementById('cfg-text-walkin').value,
    action: document.getElementById('cfg-text-action').value,
    success: document.getElementById('cfg-text-success').value,
    defer: document.getElementById('cfg-text-defer').value
  };
  
  const dividePoint1 = parseFloat(document.getElementById('cfg-divide-1').value) || 0.0;
  const dividePoint2 = parseFloat(document.getElementById('cfg-divide-2').value) || 0.0;
  
  if (state.editingReminder && state.editingReminder.hasCombinedVideo) {
    if (dividePoint1 < 0) {
      alert("Divide Point 1 (Walk-In end) must be greater than or equal to 0 seconds!");
      return;
    }
    if (dividePoint2 <= dividePoint1) {
      alert("Divide Point 2 (Action Loop end) must be greater than Divide Point 1!");
      return;
    }
  }

  // Extract repeat settings
  const repeatType = document.getElementById('cfg-reminder-repeat-type').value;
  const repeat = {
    type: repeatType,
    additionalTimes: [],
    intervalValue: 1,
    intervalUnit: 'hours'
  };
  
  if (repeatType === 'specific') {
    const pickers = document.querySelectorAll('.specific-time-picker');
    pickers.forEach(picker => {
      if (picker.value) repeat.additionalTimes.push(picker.value);
    });
    repeat.additionalTimes.sort();
  } else if (repeatType === 'interval') {
    repeat.intervalValue = Math.max(1, parseInt(document.getElementById('cfg-repeat-interval-value').value) || 1);
    repeat.intervalUnit = document.getElementById('cfg-repeat-interval-unit').value;
  }

  // Find index or push
  const index = state.reminders.findIndex(r => r.id === id);
  if (index !== -1) {
    // Update existing
    const existing = state.reminders[index];
    existing.title = title;
    existing.time = time;
    existing.screenPosition = screenPosition;
    existing.scale = scale;
    existing.texts = texts;
    existing.repeat = repeat;
    existing.customX = state.editingReminder.customX;
    existing.customY = state.editingReminder.customY;
    existing.hasCombinedVideo = state.editingReminder.hasCombinedVideo;
    existing.dividePoint1 = dividePoint1;
    existing.dividePoint2 = dividePoint2;
  } else {
    // Create new
    state.editingReminder.title = title;
    state.editingReminder.time = time;
    state.editingReminder.screenPosition = screenPosition;
    state.editingReminder.scale = scale;
    state.editingReminder.texts = texts;
    state.editingReminder.repeat = repeat;
    state.editingReminder.dividePoint1 = dividePoint1;
    state.editingReminder.dividePoint2 = dividePoint2;
    state.reminders.push(state.editingReminder);
  }
  
  saveReminders();
  renderReminders();
  updateStatusBannerGlobally();
  closeConfigDrawer();
  showNotification('Profile Saved', `Reminder settings updated successfully.`);
}

function addSpecificTimePicker(timeStr = '') {
  const container = document.getElementById('specific-times-list');
  if (!container) return;
  
  const div = document.createElement('div');
  div.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  
  div.innerHTML = `
    <input type="time" class="form-input-text specific-time-picker" style="padding: 6px; flex-grow: 1;" value="${timeStr || '12:00'}" required>
    <button type="button" class="btn btn-secondary btn-mini btn-remove-specific-time" style="padding: 6px; border-color: rgba(255,0,0,0.15);" title="Remove Time">
      <i class="fa-solid fa-trash-can" style="color: #ff4d4f;"></i>
    </button>
  `;
  
  div.querySelector('.btn-remove-specific-time').addEventListener('click', () => {
    div.remove();
  });
  
  container.appendChild(div);
}

// ----------------------------------------------------
// DAILY MULTI-REMINDER ALARM SCHEDULER
// ----------------------------------------------------
function startScheduler() {
  if (state.schedulerTimerId) clearInterval(state.schedulerTimerId);
  
  state.schedulerTimerId = setInterval(() => {
    const now = new Date();
    const currentHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const seconds = now.getSeconds();
    
    // 1. Alarm Poll: Trigger active alerts matching current time
    if (seconds === 0) {
      const allTasksCompleted = state.tasks.length > 0 && state.tasks.every(t => t.completed);
      state.reminders.forEach(reminder => {
        if (reminder.enabled) {
          const repeat = reminder.repeat || { type: 'none' };
          // Skip check-in alarms if all daily tasks are already marked completed
          if (allTasksCompleted && (repeat.type === 'none' || repeat.type === 'specific')) {
            return;
          }
          if (shouldReminderTrigger(reminder, currentHM)) {
            triggerWidgetWindow(reminder);
          }
        }
      });
    }
    
    // 2. Countdown Engine: Calculate countdown to the nearest upcoming alarm
    updateNextAlarmCountdown(now);
  }, 1000);
}

function shouldReminderTrigger(reminder, currentHM) {
  const repeat = reminder.repeat || { type: 'none' };
  
  if (repeat.type === 'none') {
    return reminder.time === currentHM;
  }
  
  if (repeat.type === 'specific') {
    return reminder.time === currentHM || (repeat.additionalTimes && repeat.additionalTimes.includes(currentHM));
  }
  
  if (repeat.type === 'interval') {
    if (currentHM < reminder.time) return false;
    
    const [startH, startM] = reminder.time.split(':').map(Number);
    const [currH, currM] = currentHM.split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const currMinutes = currH * 60 + currM;
    
    const diff = currMinutes - startMinutes;
    
    let intervalMinutes = repeat.intervalValue || 1;
    if (repeat.intervalUnit === 'hours') {
      intervalMinutes *= 60;
    }
    
    return diff % intervalMinutes === 0;
  }
  
  return false;
}

function getNextTriggerTimeForReminder(reminder, now) {
  const repeat = reminder.repeat || { type: 'none' };
  const [startH, startM] = reminder.time.split(':').map(Number);
  
  let startToday = new Date(now);
  startToday.setHours(startH, startM, 0, 0);
  
  if (repeat.type === 'none') {
    if (now < startToday) {
      return startToday;
    } else {
      let startTomorrow = new Date(startToday);
      startTomorrow.setDate(startTomorrow.getDate() + 1);
      return startTomorrow;
    }
  }
  
  if (repeat.type === 'specific') {
    const candidateTimes = [reminder.time, ...(repeat.additionalTimes || [])];
    let nextCandidate = null;
    
    for (const timeStr of candidateTimes) {
      const [h, m] = timeStr.split(':').map(Number);
      const candDate = new Date(now);
      candDate.setHours(h, m, 0, 0);
      
      if (now < candDate) {
        if (!nextCandidate || candDate < nextCandidate) {
          nextCandidate = candDate;
        }
      }
    }
    
    if (nextCandidate) {
      return nextCandidate;
    } else {
      const sortedTimes = [...candidateTimes].sort();
      const [h, m] = sortedTimes[0].split(':').map(Number);
      const tomorrowEarliest = new Date(now);
      tomorrowEarliest.setDate(tomorrowEarliest.getDate() + 1);
      tomorrowEarliest.setHours(h, m, 0, 0);
      return tomorrowEarliest;
    }
  }
  
  if (repeat.type === 'interval') {
    let intervalMinutes = repeat.intervalValue || 1;
    if (repeat.intervalUnit === 'hours') {
      intervalMinutes *= 60;
    }
    
    let candidate = new Date(startToday);
    
    if (now < candidate) {
      return candidate;
    }
    
    while (candidate <= now) {
      candidate.setMinutes(candidate.getMinutes() + intervalMinutes);
    }
    
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    
    if (candidate > endOfToday) {
      const startTomorrow = new Date(startToday);
      startTomorrow.setDate(startTomorrow.getDate() + 1);
      return startTomorrow;
    }
    
    return candidate;
  }
  
  return null;
}

function updateNextAlarmCountdown(now) {
  const allTasksCompleted = state.tasks.length > 0 && state.tasks.every(t => t.completed);
  
  // Filter out check-in reminders from countdown calculation if daily goals are completed
  const enabledReminders = state.reminders.filter(r => {
    if (!r.enabled) return false;
    const repeat = r.repeat || { type: 'none' };
    if (allTasksCompleted && (repeat.type === 'none' || repeat.type === 'specific')) {
      return false;
    }
    return true;
  });
  
  const countdownTitle = document.getElementById('lbl-countdown-title');
  const countdownDisplay = document.getElementById('countdown-display');
  const countdownSub = document.getElementById('lbl-countdown-sub');
  
  if (enabledReminders.length === 0) {
    countdownTitle.textContent = "Scheduled Alarms";
    countdownDisplay.textContent = "00:00:00";
    if (allTasksCompleted) {
      countdownSub.textContent = "Daily tasks completed! Today's check-ins are finished. 🌟";
    } else {
      countdownSub.textContent = "No active reminders found. Configure one in Reminders tab.";
    }
    return;
  }
  
  let nearestReminder = null;
  let nearestTriggerDate = null;
  let nearestDiff = Infinity;
  
  enabledReminders.forEach(reminder => {
    const nextTrigger = getNextTriggerTimeForReminder(reminder, now);
    if (nextTrigger) {
      const diff = nextTrigger - now;
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearestTriggerDate = nextTrigger;
        nearestReminder = reminder;
      }
    }
  });
  
  if (nearestReminder && nearestTriggerDate) {
    const hours = Math.floor(nearestDiff / 3600000);
    const mins = Math.floor((nearestDiff % 3600000) / 60000);
    const secs = Math.floor((nearestDiff % 60000) / 1000);
    
    const pad = (n) => String(n).padStart(2, '0');
    
    const repeat = nearestReminder.repeat || { type: 'none' };
    let repeatDesc = 'triggers once';
    if (repeat.type === 'specific') {
      repeatDesc = 'multiple scheduled times';
    } else if (repeat.type === 'interval') {
      repeatDesc = `repeats every ${repeat.intervalValue} ${repeat.intervalUnit}`;
    }
    
    countdownTitle.textContent = `Next check-in: ${nearestReminder.title}`;
    countdownDisplay.textContent = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
    
    const timeStr = `${pad(nearestTriggerDate.getHours())}:${pad(nearestTriggerDate.getMinutes())}`;
    countdownSub.textContent = `Alert triggers at ${timeStr} (${repeatDesc}) in the ${nearestReminder.screenPosition} position.`;
  }
}

// ----------------------------------------------------
// WIDGET POPUP WINDOW IPC TRIGGER
// ----------------------------------------------------
async function triggerWidgetWindow(reminder) {
  const payload = {
    reminderId: reminder.id,
    settings: {
      reminderTime: reminder.time,
      screenPosition: reminder.screenPosition,
      scale: reminder.scale,
      texts: reminder.texts,
      customX: reminder.customX,
      customY: reminder.customY
    },
    hasCombinedVideo: !!reminder.hasCombinedVideo,
    dividePoint1: reminder.dividePoint1 || 0.0,
    dividePoint2: reminder.dividePoint2 || 0.0
  };
  
  if (isElectron) {
    ipcRenderer.send('trigger-widget', payload);
  } else {
    // Web Browser window fallback
    const width = Math.round(360 * Math.max(1.0, reminder.scale));
    const height = Math.round(320 * Math.max(1.0, reminder.scale));
    const screenW = window.screen.availWidth || window.screen.width;
    const screenH = window.screen.availHeight || window.screen.height;
    
    let left = screenW - width - 20;
    let top = screenH - height - 40;
    
    switch(reminder.screenPosition) {
      case 'bottom-left':
        left = 20;
        top = screenH - height - 40;
        break;
      case 'top-right':
        left = screenW - width - 20;
        top = 40;
        break;
      case 'top-left':
        left = 20;
        top = 40;
        break;
    }
    
    const features = `width=${width},height=${height},left=${left},top=${top},menubar=no,status=no,toolbar=no,resizable=no`;
    localStorage.setItem('ari_widget_payload', JSON.stringify(payload));
    const child = window.open('widget.html', 'AriWidgetWindow', features);
    if (child) child.focus();
  }
}

// ----------------------------------------------------
// LOCAL EMULATOR SIMULATOR FOR SELECTED REMINDERS
// ----------------------------------------------------
function initEmulator() {
  state.emulator.instance = Mascot.mount('emulator-mascot', 'idle');
  setEmulatorState('idle');
  
  document.getElementById('btn-emulator-yes').addEventListener('click', () => handleEmulatorResponse(true));
  document.getElementById('btn-emulator-no').addEventListener('click', () => handleEmulatorResponse(false));
  document.getElementById('btn-emulator-reset').addEventListener('click', () => resetEmulator());
}

function setEmulatorState(newState, texts = null) {
  state.emulator.activeState = newState;
  document.getElementById('emulator-state-lbl').textContent = newState.toUpperCase();
  
  const bubble = document.getElementById('emulator-bubble');
  const bubbleText = document.getElementById('emulator-bubble-text');
  const actions = document.getElementById('emulator-bubble-actions');
  
  // Use global defaults or passed reminder texts
  const dialogueTexts = texts || {
    walkin: "Hey! Time for your daily goal check-in. Don't forget your tasks!",
    action: "Did you finish your tasks for today? Let's be honest!",
    success: "Oh that's good. I'm proud of you! Keep up the amazing work! 🥰",
    defer: "Okay, I'll come back to remind you again later. You can do it! 💪"
  };
  
  state.emulator.instance.setState(newState);
  if (state.emulator.timerId) clearTimeout(state.emulator.timerId);
  
  switch(newState) {
    case 'idle':
      bubble.classList.remove('visible');
      actions.style.display = 'none';
      state.emulator.instance.setState('idle');
      break;
      
    case 'walkin':
      bubble.classList.remove('state-success', 'state-defer');
      bubble.classList.add('visible');
      bubbleText.textContent = dialogueTexts.walkin;
      actions.style.display = 'none';
      state.emulator.instance.setState('walkin');
      
      state.emulator.timerId = setTimeout(() => {
        setEmulatorState('ask', dialogueTexts);
      }, 4000);
      break;
      
    case 'ask':
      bubble.classList.add('visible');
      bubbleText.textContent = dialogueTexts.action;
      actions.style.display = 'flex';
      state.emulator.instance.setState('ask');
      break;
      
    case 'happy':
      bubble.classList.add('state-success');
      bubbleText.textContent = dialogueTexts.success;
      actions.style.display = 'none';
      state.emulator.instance.setState('happy');
      
      state.emulator.timerId = setTimeout(() => {
        setEmulatorState('idle');
      }, 5000);
      break;
      
    case 'sad':
      bubble.classList.add('state-defer');
      bubbleText.textContent = dialogueTexts.defer;
      actions.style.display = 'none';
      state.emulator.instance.setState('sad');
      
      state.emulator.timerId = setTimeout(() => {
        setEmulatorState('idle');
      }, 5000);
      break;
  }
}

function handleEmulatorResponse(success) {
  if (success) {
    setEmulatorState('happy', state.editingReminder ? state.editingReminder.texts : null);
  } else {
    setEmulatorState('sad', state.editingReminder ? state.editingReminder.texts : null);
  }
}

function resetEmulator() {
  setEmulatorState('idle');
}

function runLocalSimulation(reminder) {
  setEmulatorState('walkin', reminder.texts);
}

// ----------------------------------------------------
// DRAG & DROP & UPLOAD SETUP INSIDE DRAWER
// ----------------------------------------------------
function setupVideoUploadZones() {
  const zone = document.getElementById('zone-combined');
  if (!zone) return;

  const fileInput = document.getElementById('cfg-combined-video');
  const removeBtn = document.getElementById('btn-remove-combined');
  const previewContainer = document.getElementById('trimmer-preview-container');
  const videoEl = document.getElementById('trimmer-video');

  zone.addEventListener('click', (e) => {
    if (e.target.closest('.btn-remove-video') || e.target.closest('video')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    if (fileInput.files.length > 0 && state.editingReminder) {
      const file = fileInput.files[0];
      
      if (file.size > 50 * 1024 * 1024) {
        alert("File size exceeds 50MB! Please compress the video first.");
        fileInput.value = '';
        return;
      }
      
      try {
        const key = `${state.editingReminder.id}_combined`;
        await saveVideoBlob(key, file);
        state.editingReminder.hasCombinedVideo = true;
        
        // Display Preview
        if (videoEl.src) URL.revokeObjectURL(videoEl.src);
        videoEl.src = URL.createObjectURL(file);
        previewContainer.classList.add('has-video');
        
        showNotification('Uploaded', `${file.name} saved.`);
      } catch(e) {
        console.error("IndexedDB Save Error:", e);
        alert("Could not store video. quota limits exceeded.");
      }
    }
  });

  removeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (state.editingReminder) {
      const key = `${state.editingReminder.id}_combined`;
      await deleteVideoBlob(key);
      state.editingReminder.hasCombinedVideo = false;
      
      if (videoEl.src) {
        URL.revokeObjectURL(videoEl.src);
        videoEl.src = '';
      }
      previewContainer.classList.remove('has-video');
      showNotification('Removed', 'Combined video cleared.');
    }
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });

  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    
    if (e.dataTransfer.files.length > 0 && state.editingReminder) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/')) {
        if (file.size > 50 * 1024 * 1024) {
          alert("File size exceeds 50MB!");
          return;
        }
        try {
          const key = `${state.editingReminder.id}_combined`;
          await saveVideoBlob(key, file);
          state.editingReminder.hasCombinedVideo = true;
          
          if (videoEl.src) URL.revokeObjectURL(videoEl.src);
          videoEl.src = URL.createObjectURL(file);
          previewContainer.classList.add('has-video');
          
          showNotification('Uploaded', `${file.name} saved.`);
        } catch(e) {
          console.error("IndexedDB Save Error:", e);
        }
      }
    }
  });

  // Background Removal Automation Buttons
  const btnRemoveBgAi = document.getElementById('btn-remove-bg-ai');
  const btnRemoveBgChroma = document.getElementById('btn-remove-bg-chroma');
  const progressContainer = document.getElementById('bg-remove-progress-container');
  const statusLbl = document.getElementById('bg-remove-status-lbl');
  const pctLbl = document.getElementById('bg-remove-pct-lbl');
  const progressBar = document.getElementById('bg-remove-progress-bar');

  async function startBackgroundRemoval(method) {
    if (!state.editingReminder) return;

    let videoFile = fileInput.files.length > 0 ? fileInput.files[0] : null;
    let videoBlob = null;

    if (!videoFile) {
      const key = `${state.editingReminder.id}_combined`;
      videoBlob = await getVideoBlob(key);
    }

    if (!videoFile && !videoBlob) {
      alert("Please upload a video file first before removing the background!");
      return;
    }

    const sourceBlob = videoFile || videoBlob;
    statusLbl.textContent = method === 'ai' ? "Extracting frames & running AI segmentation (rembg)..." : "Processing chroma key color extraction...";
    pctLbl.textContent = "0%";
    progressBar.style.width = "0%";
    progressContainer.style.display = "flex";
    if (btnRemoveBgAi) btnRemoveBgAi.disabled = true;
    if (btnRemoveBgChroma) btnRemoveBgChroma.disabled = true;

    try {
      const arrayBuffer = await sourceBlob.arrayBuffer();
      if (isElectron) {
        ipcRenderer.send('remove-video-bg', {
          arrayBuffer,
          method: method,
          color: 'green',
          tolerance: 60.0,
          softness: 10.0,
          modelName: 'u2net'
        });
      } else {
        alert("Background removal automation requires running in the Electron Desktop App!");
        progressContainer.style.display = "none";
        if (btnRemoveBgAi) btnRemoveBgAi.disabled = false;
        if (btnRemoveBgChroma) btnRemoveBgChroma.disabled = false;
      }
    } catch(err) {
      console.error("Error starting background removal:", err);
      alert("Failed to read video file buffer: " + err.message);
      progressContainer.style.display = "none";
      if (btnRemoveBgAi) btnRemoveBgAi.disabled = false;
      if (btnRemoveBgChroma) btnRemoveBgChroma.disabled = false;
    }
  }

  if (btnRemoveBgAi) {
    btnRemoveBgAi.addEventListener('click', (e) => {
      e.stopPropagation();
      startBackgroundRemoval('ai');
    });
  }

  if (btnRemoveBgChroma) {
    btnRemoveBgChroma.addEventListener('click', (e) => {
      e.stopPropagation();
      startBackgroundRemoval('chroma');
    });
  }

  if (isElectron) {
    ipcRenderer.on('remove-video-bg-progress', (event, data) => {
      const pct = data.progress || 0;
      if (pctLbl) pctLbl.textContent = `${pct}%`;
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (statusLbl) statusLbl.textContent = `Processing video frames (${pct}%)...`;
    });

    ipcRenderer.on('remove-video-bg-complete', async (event, res) => {
      if (btnRemoveBgAi) btnRemoveBgAi.disabled = false;
      if (btnRemoveBgChroma) btnRemoveBgChroma.disabled = false;
      
      if (res.success && res.buffer) {
        try {
          const transparentBlob = new Blob([res.buffer], { type: 'video/webm' });
          const key = `${state.editingReminder.id}_combined`;
          await saveVideoBlob(key, transparentBlob);
          state.editingReminder.hasCombinedVideo = true;

          if (videoEl.src) URL.revokeObjectURL(videoEl.src);
          videoEl.src = URL.createObjectURL(transparentBlob);
          previewContainer.classList.add('has-video');

          if (pctLbl) pctLbl.textContent = "100%";
          if (progressBar) progressBar.style.width = "100%";
          if (statusLbl) statusLbl.textContent = "✓ Background removed successfully!";
          showNotification('BG Removed', 'Transparent WebM video created and saved!');
          setTimeout(() => {
            if (progressContainer) progressContainer.style.display = "none";
          }, 3000);
        } catch(e) {
          console.error("Error saving transparent video blob:", e);
          alert("Error saving output video: " + e.message);
          if (progressContainer) progressContainer.style.display = "none";
        }
      } else {
        alert("Background Removal Failed: " + (res.error || "Unknown error"));
        if (progressContainer) progressContainer.style.display = "none";
      }
    });
  }
}

// ----------------------------------------------------
// TAB NAVIGATION SETUP
// ----------------------------------------------------
function setupTabs() {
  const buttons = document.querySelectorAll('.nav-button');
  const panels = document.querySelectorAll('.tab-panel');
  
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      
      buttons.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      const targetPanel = document.getElementById(tabId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
      
      state.activeTab = tabId;
    });
  });
}

// ----------------------------------------------------
// APP INITIALIZATION
// ----------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  loadTasks();
  loadReminders();
  setupVideoUploadZones();
  initEmulator();
  startScheduler();
  
  // Tasks Form binders
  document.getElementById('btn-add-task').addEventListener('click', () => {
    const input = document.getElementById('task-input-field');
    addTask(input.value);
    input.value = '';
  });
  
  document.getElementById('task-input-field').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const input = document.getElementById('task-input-field');
      addTask(input.value);
      input.value = '';
    }
  });
  
  // Drawer triggers
  document.getElementById('btn-create-reminder').addEventListener('click', () => openConfigDrawer());
  document.getElementById('btn-close-drawer').addEventListener('click', closeConfigDrawer);
  document.getElementById('btn-cancel-reminder').addEventListener('click', closeConfigDrawer);
  document.getElementById('config-drawer-overlay').addEventListener('click', closeConfigDrawer);
  
  document.getElementById('reminder-profile-form').addEventListener('submit', handleProfileFormSubmit);
  
  // Slider displays
  document.getElementById('cfg-popup-scale').addEventListener('input', (e) => {
    document.getElementById('val-popup-scale').textContent = parseFloat(e.target.value).toFixed(1) + 'x';
  });

  // Bind Repeat Schedule dropdown change events
  document.getElementById('cfg-reminder-repeat-type').addEventListener('change', (e) => {
    const val = e.target.value;
    const spec = document.getElementById('repeat-specific-container');
    const inter = document.getElementById('repeat-interval-container');
    
    if (val === 'specific') {
      spec.style.display = 'block';
      inter.style.display = 'none';
    } else if (val === 'interval') {
      spec.style.display = 'none';
      inter.style.display = 'block';
    } else {
      spec.style.display = 'none';
      inter.style.display = 'none';
    }
  });

  // Bind Add Trigger Time button
  document.getElementById('btn-add-specific-time').addEventListener('click', () => {
    addSpecificTimePicker();
  });

  // Bind Corner Placement dropdown change events
  document.getElementById('cfg-screen-position').addEventListener('change', (e) => {
    const val = e.target.value;
    const setupGrp = document.getElementById('custom-position-setup-grp');
    if (val === 'custom') {
      setupGrp.style.display = 'block';
    } else {
      setupGrp.style.display = 'none';
    }
  });

  // Bind Set Custom Position button click
  document.getElementById('btn-set-custom-pos').addEventListener('click', () => {
    if (isElectron && state.editingReminder) {
      // Pull scale from current scale slider in the drawer
      const currentScale = parseFloat(document.getElementById('cfg-popup-scale').value);
      state.editingReminder.scale = currentScale;
      
      const payload = {
        reminderId: state.editingReminder.id,
        settings: {
          reminderTime: document.getElementById('cfg-reminder-time').value,
          screenPosition: 'custom',
          scale: currentScale,
          customX: state.editingReminder.customX,
          customY: state.editingReminder.customY,
          texts: state.editingReminder.texts
        },
        hasCombinedVideo: !!state.editingReminder.hasCombinedVideo,
        dividePoint1: state.editingReminder.dividePoint1 || 0.0,
        dividePoint2: state.editingReminder.dividePoint2 || 0.0
      };
      ipcRenderer.send('trigger-widget-positioner', payload);
    } else {
      alert("Custom positioning calibration is only supported in native desktop mode!");
    }
  });

  // Listen for messages from popup widget (Web Fallback)
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'TASKS_COMPLETED_YES') {
      completeAllTasks();
    }
  });

  // Listen for Electron IPC event triggers
  if (isElectron) {
    ipcRenderer.on('sync-tasks-completed', () => {
      completeAllTasks();
    });
    
    ipcRenderer.on('custom-position-saved', (event, arg) => {
      console.log("DASHBOARD RENDERER: custom-position-saved received in app.js with:", arg);
      if (state.editingReminder) {
        state.editingReminder.customX = arg.x;
        state.editingReminder.customY = arg.y;
        state.editingReminder.scale = arg.scale;
        
        // Update the drawer inputs in real-time
        document.getElementById('cfg-popup-scale').value = arg.scale;
        document.getElementById('val-popup-scale').textContent = arg.scale.toFixed(1) + 'x';
        document.getElementById('lbl-custom-coords').textContent = `Coordinates: X: ${arg.x}, Y: ${arg.y}`;
        
        showNotification('Position Saved', `Ari Reminds will now open at coordinates X: ${arg.x}, Y: ${arg.y} with a ${arg.scale.toFixed(1)}x character scale!`);
      } else {
        console.warn("DASHBOARD RENDERER: WARNING - state.editingReminder was null when custom-position-saved triggered!");
      }
    });
  }

  // Bind Set Current Divide points capture
  document.getElementById('btn-set-divide-1').addEventListener('click', () => {
    const video = document.getElementById('trimmer-video');
    if (video && video.src) {
      document.getElementById('cfg-divide-1').value = video.currentTime.toFixed(1);
    } else {
      alert("Please upload and play a combined video first to capture its current time!");
    }
  });

  document.getElementById('btn-set-divide-2').addEventListener('click', () => {
    const video = document.getElementById('trimmer-video');
    if (video && video.src) {
      document.getElementById('cfg-divide-2').value = video.currentTime.toFixed(1);
    } else {
      alert("Please upload and play a combined video first to capture its current time!");
    }
  });
});

// Helper function to complete all daily goals
function completeAllTasks() {
  state.tasks.forEach(t => t.completed = true);
  saveTasks();
  updateTaskDOM();
  updateProgressStats();
  
  setEmulatorState('happy');
  showNotification('Goal Met!', "All daily tasks marked completed! I'm proud of you! 🥰");
}
