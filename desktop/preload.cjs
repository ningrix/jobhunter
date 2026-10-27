/** 预加载：向导页只用这两个最小能力，不暴露 Node */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jh", {
  info: () => ipcRenderer.invoke("app:info"),
  finishSetup: () => ipcRenderer.invoke("setup:finish"),
});
