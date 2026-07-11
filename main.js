/**
 * main.js
 * Electron main process controller for Ari Reminds.
 * Configures application shells, sets up transparent overlay settings,
 * monitors coordinate math for screens, and routes IPC messages.
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let dashboardWindow = null;
let widgetWindow = null;

function createDashboardWindow() {
  dashboardWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 950,
    minHeight: 650,
    title: "Ari Reminds Dashboard",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  dashboardWindow.loadFile('index.html');

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
    // If main dashboard is closed, exit the application
    if (widgetWindow) {
      widgetWindow.close();
    }
    app.quit();
  });
}

// IPC Communication Channel Routings
ipcMain.on('trigger-widget', (event, payload) => {
  // If an active widget window is already running, close it first
  if (widgetWindow) {
    widgetWindow.close();
    widgetWindow = null;
  }

  // Fetch Primary display workArea parameters (excludes menu bars / docks)
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH, x: screenX, y: screenY } = primaryDisplay.workArea;

  // Window Dimension calculations based on scale
  const scale = payload.settings.scale || 1.0;
  const widgetW = Math.round(360 * Math.max(1.0, scale));
  const widgetH = Math.round(320 * Math.max(1.0, scale));

  // Position coordinates configurations
  let left = screenX + screenW - widgetW - 20;
  let top = screenY + screenH - widgetH - 20; // Default: Bottom Right

  switch(payload.settings.screenPosition) {
    case 'bottom-left':
      left = screenX + 20;
      top = screenY + screenH - widgetH - 20;
      break;
    case 'top-right':
      left = screenX + screenW - widgetW - 20;
      top = screenY + 20;
      break;
    case 'top-left':
      left = screenX + 20;
      top = screenY + 20;
      break;
    case 'custom':
      left = payload.settings.customX !== undefined ? payload.settings.customX : (screenX + screenW - widgetW - 20);
      top = payload.settings.customY !== undefined ? payload.settings.customY : (screenY + screenH - widgetH - 20);
      break;
  }

  // Create native transparent frameless overlay
  widgetWindow = new BrowserWindow({
    width: widgetW,
    height: widgetH,
    x: left,
    y: top,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  widgetWindow.loadFile('widget.html');

  // Once loaded, transmit payload data directly to widget renderer
  const targetWebContents = widgetWindow.webContents;
  targetWebContents.on('did-finish-load', () => {
    if (!targetWebContents.isDestroyed()) {
      targetWebContents.send('init-widget', payload);
    }
  });

  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });
});

ipcMain.on('trigger-widget-positioner', (event, payload) => {
  if (widgetWindow) {
    widgetWindow.close();
    widgetWindow = null;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH, x: screenX, y: screenY } = primaryDisplay.workArea;

  const widgetW = 480;
  const widgetH = 400;

  let left = payload.settings.customX !== undefined ? payload.settings.customX : screenX + Math.round((screenW - widgetW) / 2);
  let top = payload.settings.customY !== undefined ? payload.settings.customY : screenY + Math.round((screenH - widgetH) / 2);

  widgetWindow = new BrowserWindow({
    width: widgetW,
    height: widgetH,
    x: left,
    y: top,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  widgetWindow.loadFile('widget.html');

  payload.isPositionerMode = true;

  const targetWebContents = widgetWindow.webContents;
  targetWebContents.on('did-finish-load', () => {
    if (!targetWebContents.isDestroyed()) {
      targetWebContents.send('init-widget', payload);
    }
  });

  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });
});

ipcMain.on('save-custom-position', (event, arg) => {
  console.log("MAIN PROCESS: save-custom-position received with scale:", arg.scale);
  if (widgetWindow && dashboardWindow) {
    const [x, y] = widgetWindow.getPosition();
    console.log("MAIN PROCESS: Widget position is:", x, y, "Sending custom-position-saved to dashboard renderer");
    dashboardWindow.webContents.send('custom-position-saved', { x, y, scale: arg.scale });
    widgetWindow.close();
    widgetWindow = null;
  } else {
    console.warn("MAIN PROCESS: Warning - widgetWindow or dashboardWindow was null!", !!widgetWindow, !!dashboardWindow);
  }
});

ipcMain.on('move-widget-window', (event, arg) => {
  if (widgetWindow) {
    const [x, y] = widgetWindow.getPosition();
    const targetX = Math.round(x + arg.deltaX);
    const targetY = Math.round(y + arg.deltaY);
    widgetWindow.setPosition(targetX, targetY);
  }
});

ipcMain.on('close-widget', () => {
  if (widgetWindow) {
    widgetWindow.close();
    widgetWindow = null;
  }
});

// Sync task checkoffs between popup widget click and dashboard
ipcMain.on('tasks-completed', () => {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('sync-tasks-completed');
  }
});

// App lifecycle triggers
app.whenReady().then(() => {
  createDashboardWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDashboardWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
