const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let serverProcess = null;
let mainWindow = null;

const serverPath = app.isPackaged
  ? path.join(process.resourcesPath, 'NovelGrabServer', 'novelgrab-server')
  : path.join(__dirname, 'NovelGrabServer', 'novelgrab-server');

function startServer() {
  serverProcess = spawn(serverPath, [], {
    stdio: 'pipe',
    env: { ...process.env },
  });
  serverProcess.stdout?.on('data', (d) => {
    console.log(`[NovelGrab] ${d.toString().trim()}`);
  });
  serverProcess.stderr?.on('data', (d) => {
    console.error(`[NovelGrab] ${d.toString().trim()}`);
  });
  serverProcess.on('error', (err) => {
    console.error('Failed to start NovelGrab server:', err.message);
  });
  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`NovelGrab server exited with code ${code}`);
    }
  });
}

function stopServer() {
  if (!serverProcess) return;
  const p = serverProcess;
  serverProcess = null;
  try {
    p.kill('SIGTERM');
  } catch {}
  setTimeout(() => {
    try {
      p.kill('SIGKILL');
    } catch {}
  }, 3000).unref();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'NovelGrab',
    width: 1366,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  mainWindow.setMenu(null);

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopServer();
  });
}

ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

app.whenReady().then(() => {
  startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});

app.on('will-quit', () => {
  stopServer();
});

app.on('before-quit', () => {
  stopServer();
});
