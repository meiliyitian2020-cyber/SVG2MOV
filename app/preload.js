const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('api',{
 pick:()=>ipcRenderer.invoke('pick'), getSettings:()=>ipcRenderer.invoke('get-settings'),saveSettings:s=>ipcRenderer.invoke('save-settings',s),
 folder:()=>ipcRenderer.invoke('folder'), add:paths=>ipcRenderer.invoke('add',paths), cancel:()=>ipcRenderer.invoke('cancel'),
 pathForFile:f=>webUtils.getPathForFile(f),reveal:p=>ipcRenderer.invoke('reveal',p),
 onEvent:fn=>ipcRenderer.on('update',(_,data)=>fn(data))
});
