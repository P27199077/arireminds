/**
 * widget.js
 * Controls the mascot popup window state machine, video player,
 * SVG avatar fallback animation, speech text, and interaction callbacks.
 */

// Electron environment check
const isElectron = typeof require !== 'undefined' && require('electron');
const ipcRenderer = isElectron ? require('electron').ipcRenderer : null;

// State tracking
let reminderId = 'default';
let settings = null;
let hasVideos = {};
let activeState = 'idle';
let mascotInstance = null;
let videoUrls = {
  'walk-in': null,
  'action': null,
  'walk-out': null
};

const DB_NAME = 'AriVideosDB';
const STORE_NAME = 'videos';
const DB_VERSION = 1;

// ----------------------------------------------------
// DATABASE INDEXEDDB HELPER FOR WIDGET WINDOW
// ----------------------------------------------------
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function fetchVideoBlob(slot) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(`${reminderId}_${slot}`);
      request.onsuccess = (e) => resolve(e.target.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch(e) {
    console.error("IndexedDB fetch error in widget:", e);
    return null;
  }
}

// Prepare video sources from DB Blob items
async function loadVideoAssets() {
  for (const slot of Object.keys(videoUrls)) {
    if (hasVideos[slot]) {
      const blob = await fetchVideoBlob(slot);
      if (blob) {
        videoUrls[slot] = URL.createObjectURL(blob);
      } else {
        hasVideos[slot] = false;
      }
    }
  }
}

// Clean up object URLs on exit
window.addEventListener('beforeunload', () => {
  Object.values(videoUrls).forEach(url => {
    if (url) URL.revokeObjectURL(url);
  });
});

// ----------------------------------------------------
// STATE MACHINE ROUTER
// ----------------------------------------------------
async function setWidgetState(stateName) {
  activeState = stateName;
  
  const videoPlayer = document.getElementById('widget-video');
  const fallbackContainer = document.getElementById('widget-fallback-container');
  const bubble = document.getElementById('speech-bubble');
  const bubbleText = document.getElementById('speech-text');
  const actions = document.getElementById('speech-actions');
  const isPositioner = document.body.classList.contains('is-positioner-mode');
  
  if (mascotInstance) {
    mascotInstance.setState(stateName);
  }
  
  videoPlayer.style.display = 'none';
  fallbackContainer.style.display = 'block';
  
  videoPlayer.pause();
  
  switch(stateName) {
    case 'walkin':
      bubble.className = 'speech-bubble';
      bubbleText.textContent = settings.texts.walkin;
      actions.style.display = 'none';
      
      if (hasVideos['walk-in'] && videoUrls['walk-in']) {
        fallbackContainer.style.display = 'none';
        videoPlayer.style.display = 'block';
        videoPlayer.src = videoUrls['walk-in'];
        videoPlayer.loop = false;
        videoPlayer.onended = () => setWidgetState('ask');
        
        try {
          await videoPlayer.play();
        } catch(e) {
          console.warn("Video autoplay blocked, proceeding with timer fallback", e);
          setTimeout(() => setWidgetState('ask'), 4000);
        }
      } else {
        setTimeout(() => {
          setWidgetState('ask');
        }, 4000);
      }
      break;
      
    case 'ask':
      if (isPositioner) {
        bubbleText.textContent = "Drag me anywhere on your screen, and adjust my scale slider below!";
        actions.style.display = 'none';
        document.getElementById('positioner-actions').style.display = 'flex';
      } else {
        bubbleText.textContent = settings.texts.action;
        actions.style.display = 'flex';
        document.getElementById('positioner-actions').style.display = 'none';
      }
      
      if (hasVideos['action'] && videoUrls['action']) {
        fallbackContainer.style.display = 'none';
        videoPlayer.style.display = 'block';
        videoPlayer.src = videoUrls['action'];
        videoPlayer.loop = true;
        videoPlayer.onended = null;
        
        try {
          await videoPlayer.play();
        } catch(e) {
          console.warn("Autoplay blocked for loop", e);
        }
      }
      break;
      
    case 'happy':
      bubble.className = 'speech-bubble state-success';
      bubbleText.textContent = settings.texts.success;
      actions.style.display = 'none';
      
      if (isElectron) {
        ipcRenderer.send('tasks-completed');
      } else {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'TASKS_COMPLETED_YES' }, '*');
        }
      }
      
      if (hasVideos['walk-out'] && videoUrls['walk-out']) {
        fallbackContainer.style.display = 'none';
        videoPlayer.style.display = 'block';
        videoPlayer.src = videoUrls['walk-out'];
        videoPlayer.loop = false;
        videoPlayer.onended = () => closeWidget();
        
        try {
          await videoPlayer.play();
        } catch(e) {
          console.warn("Video blocked, closing in 5s", e);
          setTimeout(closeWidget, 5000);
        }
      } else {
        setTimeout(closeWidget, 5000);
      }
      break;
      
    case 'sad':
      bubble.className = 'speech-bubble state-defer';
      bubbleText.textContent = settings.texts.defer;
      actions.style.display = 'none';
      
      if (hasVideos['walk-out'] && videoUrls['walk-out']) {
        fallbackContainer.style.display = 'none';
        videoPlayer.style.display = 'block';
        videoPlayer.src = videoUrls['walk-out'];
        videoPlayer.loop = false;
        videoPlayer.onended = () => closeWidget();
        
        try {
          await videoPlayer.play();
        } catch(e) {
          console.warn("Video blocked, closing in 5s", e);
          setTimeout(closeWidget, 5000);
        }
      } else {
        setTimeout(closeWidget, 5000);
      }
      break;
  }
}

function closeWidget() {
  document.getElementById('widget-viewport').style.opacity = '0';
  document.getElementById('widget-viewport').style.transform = 'translateY(20px) scale(0.9)';
  document.getElementById('widget-viewport').style.transition = 'all 0.5s ease';
  
  setTimeout(() => {
    if (isElectron) {
      ipcRenderer.send('close-widget');
    } else {
      window.close();
    }
  }, 500);
}

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  if (isElectron) {
    document.body.classList.add('is-electron');
  }
  // Bind buttons immediately
  document.getElementById('btn-yes').addEventListener('click', () => setWidgetState('happy'));
  document.getElementById('btn-no').addEventListener('click', () => setWidgetState('sad'));
  document.getElementById('btn-save-position').addEventListener('click', () => {
    console.log("WIDGET RENDERER: Save Position & Scale clicked!");
    if (isElectron) {
      const currentScale = parseFloat(document.getElementById('positioner-scale-slider').value);
      console.log("WIDGET RENDERER: Sending save-custom-position IPC with scale", currentScale);
      ipcRenderer.send('save-custom-position', { scale: currentScale });
    }
  });

  const positionerSlider = document.getElementById('positioner-scale-slider');
  const positionerScaleVal = document.getElementById('positioner-scale-val');
  positionerSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    positionerScaleVal.textContent = val.toFixed(1) + 'x';
    document.documentElement.style.setProperty('--widget-scale', val);
  });

  // Set up dragging listeners for custom positioning calibration mode
  let isDragging = false;
  let startMouseX = 0;
  let startMouseY = 0;

  document.addEventListener('mousedown', (e) => {
    if (!document.body.classList.contains('is-positioner-mode')) return;
    
    // Check if clicking the mascot wrapper or any of its subelements
    const wrapper = document.querySelector('.mascot-wrapper');
    if (wrapper && wrapper.contains(e.target)) {
      isDragging = true;
      startMouseX = e.screenX;
      startMouseY = e.screenY;
      e.preventDefault(); // Prevents default browser image drag shadow overlays
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.screenX - startMouseX;
    const deltaY = e.screenY - startMouseY;
    
    startMouseX = e.screenX;
    startMouseY = e.screenY;

    if (isElectron) {
      ipcRenderer.send('move-widget-window', { deltaX, deltaY });
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
  if (isElectron) {
    // Listen for data from Electron main process
    ipcRenderer.on('init-widget', async (event, payload) => {
      reminderId = payload.reminderId || 'default';
      settings = payload.settings;
      hasVideos = payload.hasVideos;
      
      document.documentElement.style.setProperty('--widget-scale', settings.scale);
      mascotInstance = Mascot.mount('widget-fallback-container', 'idle');
      await loadVideoAssets();
      
      if (payload.isPositionerMode) {
        document.body.classList.add('is-positioner-mode');
        document.getElementById('speech-text').textContent = "Drag me anywhere on your screen, and adjust my scale slider below!";
        document.getElementById('positioner-actions').style.display = 'flex';
        document.getElementById('speech-actions').style.display = 'none';
        
        // Populate slider
        positionerSlider.value = settings.scale || 1.0;
        positionerScaleVal.textContent = parseFloat(positionerSlider.value).toFixed(1) + 'x';
        document.documentElement.style.setProperty('--widget-scale', positionerSlider.value);
        
        setWidgetState('ask');
      } else {
        setWidgetState('walkin');
      }
    });
  } else {
    // Web Fallback load from localStorage
    const rawPayload = localStorage.getItem('ari_widget_payload');
    if (!rawPayload) {
      console.error("No configuration payload found for widget!");
      window.close();
      return;
    }
    
    try {
      const payload = JSON.parse(rawPayload);
      reminderId = payload.reminderId || 'default';
      settings = payload.settings;
      hasVideos = payload.hasVideos;
    } catch(e) {
      console.error("Payload decoding failed:", e);
      window.close();
      return;
    }
    
    document.documentElement.style.setProperty('--widget-scale', settings.scale);
    mascotInstance = Mascot.mount('widget-fallback-container', 'idle');
    await loadVideoAssets();
    setWidgetState('walkin');
  }
});
