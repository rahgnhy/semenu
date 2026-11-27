'use strict';

/**
 * preload.js — the only bridge between the renderer and the main process.
 * Everything the UI can do is exposed here, namespaced under window.SEMENU.
 */

const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');

function sub(channel, cb) {
  const listener = (event, ...args) => cb(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('seMenu', {
  isDev: new URLSearchParams(location.search).has('dev') || process.argv.includes('--dev'),
  isSelftest: new URLSearchParams(location.search).has('selftest') || process.argv.includes('--selftest'),
  isShots: new URLSearchParams(location.search).has('shots') || process.argv.includes('--shots'),

  app: {
    info: () => invoke('app:info'),
    setStartup: enabled => invoke('app:setStartup', enabled),
    relaunch: () => invoke('app:relaunch'),
    quit: () => invoke('app:quit'),
  },

  win: {
    minimize: () => invoke('win:minimize'),
    maximize: () => invoke('win:maximize'),
    close: () => invoke('win:close'),
    isMaximized: () => invoke('win:isMaximized'),
    onMaximized: cb => sub('win:maximized', cb),
    onShown: cb => sub('win:shown', cb),
  },

  sys: {
    info: () => invoke('sys:info'),
    onTick: cb => sub('sys:tick', cb),
  },

  net: {
    ping: (host, timeout) => invoke('net:ping', host, timeout),
    interfaces: () => invoke('net:interfaces'),
    externalIP: (url) => invoke('net:externalIP', url),
    dns: (host, type) => invoke('net:dns', host, type),
    http: opts => invoke('net:http', opts),
    speedtest: (kind, url, durationMs) => invoke('net:speedtest', { kind, url, durationMs }),
    traceroute: host => invoke('net:traceroute', host),
    onSpeedProgress: cb => sub('net:speed:progress', cb),
    onTraceHop: cb => sub('net:trace:hop', cb),
  },

  config: {
    get: () => invoke('config:get'),
    set: patch => invoke('config:set', patch),
    reset: () => invoke('config:reset'),
  },

  dialog: {
    save: opts => invoke('dialog:save', opts),
    openFile: opts => invoke('dialog:openFile', opts),
  },

  file: {
    hash: (filePath, algo) => invoke('file:hash', { filePath, algo }),
    onHashProgress: cb => sub('file:hash:progress', cb),
  },

  shell: {
    openExternal: url => invoke('shell:openExternal', url),
    showItemInFolder: p => invoke('shell:showItemInFolder', p),
    openPath: p => invoke('shell:openPath', p),
  },

  updater: {
    getConfig: () => invoke('updater:config:get'),
    getState: () => invoke('updater:state:get'),
    setConfig: patch => invoke('updater:config:set', patch),
    check: () => invoke('updater:check'),
    download: () => invoke('updater:download'),
    install: () => invoke('updater:install'),
    skip: version => invoke('updater:skip', version),
    resetSkipped: () => invoke('updater:resetSkipped'),
    openDownloaded: () => invoke('updater:openDownloaded'),
    showDownloaded: () => invoke('updater:showDownloaded'),
    onState: cb => sub('updater:state', cb),
    onCheckNow: cb => sub('updater:checkNow', cb),
  },

  perf: {
    benchmark: iterations => invoke('perf:benchmark', iterations),
    stressStart: seconds => invoke('stress:start', seconds),
    stressStop: () => invoke('stress:stop'),
    onStress: cb => sub('stress:progress', cb),
    onStressDone: cb => sub('stress:done', cb),
  },

  screen: {
    displays: () => invoke('screen:displays'),
  },

  desktopCapturer: {
    getSources: opts => invoke('desktopCapturer:getSources', opts),
  },

  opencodeReset: {
    start: opts => invoke('opencode-reset:start', opts),
    stop: opts => invoke('opencode-reset:stop', opts),
    write: data => invoke('opencode-reset:write', data),
    status: () => invoke('opencode-reset:status'),
    check: () => invoke('opencode-reset:check'),
    onData: cb => sub('opencode-reset:data', cb),
    onExit: cb => sub('opencode-reset:exit', cb),
    onStatus: cb => sub('opencode-reset:status', cb),
  },

  il2cpp: {
    pickApk: () => invoke('il2cpp:pickApk'),
    dump: opts => invoke('il2cpp:dump', opts),
    analyse: opts => invoke('il2cpp:analyse', opts),
    search: opts => invoke('il2cpp:search', opts),
    typeDetail: opts => invoke('il2cpp:typeDetail', opts),
    readFile: opts => invoke('il2cpp:readFile', opts),
    saveFile: opts => invoke('il2cpp:saveFile', opts),
    downloadFile: opts => invoke('il2cpp:downloadFile', opts),
    downloadAll: opts => invoke('il2cpp:downloadAll', opts),
    openFolder: opts => invoke('il2cpp:openFolder', opts),
  },

  notify: (title, body) => invoke('notify', { title, body }),
  getPathForFile: (file) => { try { return require('electron').webUtils.getPathForFile(file); } catch (e) { return file && file.path ? file.path : ''; } },

  selftest: {
    report: results => invoke('selftest:report', results),
    screenshot: () => invoke('selftest:screenshot'),
  },
});
