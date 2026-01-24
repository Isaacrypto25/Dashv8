const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  lerVendasDia: () => ipcRenderer.invoke('ler-vendas-dia')
});
