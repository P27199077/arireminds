/**
 * main.js
 * Electron main process controller for Ari Reminds.
 * Configures application shells, sets up transparent overlay settings,
 * monitors coordinate math for screens, and routes IPC messages.
 */

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let dashboardWindow = null;
let widgetWindow = null;
let tray = null;
let isQuitting = false;

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  if (!fs.existsSync(iconPath)) {
    // Write 16x16 transparent purple circle PNG to file system
    fs.writeFileSync(iconPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMElEQVQ4T2N8z8DwhwGHgCFCGBgYGBghbIAyGBgYoBgFozmEEB6jOQSDMRyC0RxC/AMAo30JA24M6wAAAABJRU5ErkJggg==', 'base64'));
  }
  
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Show Dashboard', 
      click: () => {
        if (dashboardWindow) {
          dashboardWindow.show();
          dashboardWindow.focus();
        }
      } 
    },
    { type: 'separator' },
    { 
      label: 'Quit Ari Reminds', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip('Ari Reminds - Desktop Mascot Assistant');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (dashboardWindow) {
      if (dashboardWindow.isVisible()) {
        dashboardWindow.hide();
      } else {
        dashboardWindow.show();
        dashboardWindow.focus();
      }
    }
  });
}

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

  // Minimize/Hide to tray when clicking close (x) button
  dashboardWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      dashboardWindow.hide();
    }
  });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
    if (widgetWindow) {
      widgetWindow.close();
    }
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

  const scale = payload.settings.scale || 1.0;
  const widgetW = Math.max(500, Math.round(440 * Math.max(1.0, scale)));
  const widgetH = Math.max(540, Math.round(460 * Math.max(1.0, scale)));

  // Position coordinates configurations
  let left = screenX + screenW - widgetW - 20;
  let top = screenY + screenH - widgetH - 20; // Default: Bottom Right

  if (payload.settings.customX !== undefined && payload.settings.customY !== undefined) {
    left = payload.settings.customX;
    top = payload.settings.customY;
  } else {
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
      default:
        left = screenX + screenW - widgetW - 20;
        top = screenY + screenH - widgetH - 20;
        break;
    }
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

  const scale = (payload.settings && payload.settings.scale) ? payload.settings.scale : 1.0;
  const widgetW = Math.max(500, Math.round(440 * Math.max(1.0, scale)));
  const widgetH = Math.max(540, Math.round(460 * Math.max(1.0, scale)));

  let left = payload.settings.customX !== undefined ? payload.settings.customX : screenX + Math.round((screenW - widgetW) / 2);
  let top = payload.settings.customY !== undefined ? payload.settings.customY : screenY + Math.round((screenH - widgetH) / 3);

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
  console.log("MAIN PROCESS: save-custom-position received with scale, crop, bubblePos, textScale, mascotX, mascotY:", arg);
  if (widgetWindow && dashboardWindow) {
    const [x, y] = widgetWindow.getPosition();
    console.log("MAIN PROCESS: Widget position is:", x, y, "Sending custom-position-saved to dashboard renderer");
    dashboardWindow.webContents.send('custom-position-saved', {
      x,
      y,
      scale: arg.scale,
      crop: arg.crop,
      bubblePosition: arg.bubblePosition,
      textScale: arg.textScale,
      bubbleGap: arg.bubbleGap,
      mascotX: arg.mascotX,
      mascotY: arg.mascotY
    });
    widgetWindow.close();
    widgetWindow = null;
  } else {
    console.warn("MAIN PROCESS: Warning - widgetWindow or dashboardWindow was null!", !!widgetWindow, !!dashboardWindow);
  }
});

ipcMain.on('align-mascot-window', (event, arg) => {
  if (widgetWindow && arg && arg.x !== undefined && arg.y !== undefined) {
    widgetWindow.setPosition(Math.round(arg.x), Math.round(arg.y));
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

// Background Removal Automation Engine IPC
ipcMain.on('remove-video-bg', async (event, payload) => {
  const { arrayBuffer, method = 'ai', color = 'green', tolerance = 60.0, softness = 10.0, modelName = 'u2net' } = payload;
  
  const tempDir = app.getPath('temp');
  const tempInputPath = path.join(tempDir, `ari_bg_in_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mp4`);
  const tempOutputPath = path.join(tempDir, `ari_bg_out_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.webm`);
  
  try {
    // Write buffer to temp input file
    fs.writeFileSync(tempInputPath, Buffer.from(arrayBuffer));

    const pythonBin = '/Users/tanishagupta/.gemini/antigravity-ide/scratch/venv/bin/python';
    const scriptPath = '/Users/tanishagupta/.gemini/antigravity-ide/scratch/automations/video_processing/remove_video_bg.py';

    const args = [
      scriptPath,
      '-i', tempInputPath,
      '-o', tempOutputPath,
      '-m', method,
      '-f', 'webm',
      '-c', color,
      '-t', String(tolerance),
      '-s', String(softness),
      '--model', 'isnet-general-use',
      '--alpha-matting'
    ];

    console.log("MAIN PROCESS: Launching bg removal automation:", pythonBin, args.join(' '));
    const pyProcess = spawn(pythonBin, args);

    pyProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/PROGRESS:(\d+)/);
      if (match && dashboardWindow && !dashboardWindow.isDestroyed()) {
        dashboardWindow.webContents.send('remove-video-bg-progress', { progress: parseInt(match[1], 10) });
      }
    });

    let errorLog = '';
    pyProcess.stderr.on('data', (data) => {
      errorLog += data.toString();
    });

    pyProcess.on('close', (code) => {
      console.log("MAIN PROCESS: Python process finished with code:", code);
      if (code === 0 && fs.existsSync(tempOutputPath)) {
        const transparentBuffer = fs.readFileSync(tempOutputPath);
        
        // Clean up temp files
        try { fs.unlinkSync(tempInputPath); } catch(e) {}
        try { fs.unlinkSync(tempOutputPath); } catch(e) {}

        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
          dashboardWindow.webContents.send('remove-video-bg-complete', {
            success: true,
            buffer: transparentBuffer
          });
        }
      } else {
        // Clean up temp input
        try { fs.unlinkSync(tempInputPath); } catch(e) {}
        if (fs.existsSync(tempOutputPath)) {
          try { fs.unlinkSync(tempOutputPath); } catch(e) {}
        }
        
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
          dashboardWindow.webContents.send('remove-video-bg-complete', {
            success: false,
            error: errorLog || `Python process exited with code ${code}`
          });
        }
      }
    });
  } catch(e) {
    console.error("MAIN PROCESS: Error launching bg removal:", e);
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('remove-video-bg-complete', {
        success: false,
        error: e.message
      });
    }
  }
});

// App lifecycle triggers
app.whenReady().then(() => {
  createTray();
  createDashboardWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDashboardWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
