const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('dashboard.html');
}

ipcMain.handle('ler-vendas-dia', async () => {
  try {
    // ajuste o caminho se necessário
    const caminho = path.join(app.getPath('documents'), 'Vendasdia.csv');
    return fs.readFileSync(caminho, 'utf-8');
  } catch (err) {
    console.error('Erro ao ler CSV:', err);
    return '';
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
