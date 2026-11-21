// Bezpieczny most między oknami (wyspa, ustawienia) a procesem głównym.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const INVOKE = ['init', 'clip-text', 'mem-top', 'settings-get', 'settings-set', 'files-add', 'file-remove', 'files-clear', 'phone-start',
  'notices', 'agents', 'reminders', 'reminder-add', 'reminder-remove', 'rec-start', 'launch-pick', 'launch-info',
  'weather-city', 'notes', 'claude-status', 'claude-connect', 'hotkey-errors', 'sys', 'win-accent', 'calendar', 'obs-local', 'obs-state', 'app-icon', 'settings-pos',
  'chat-recent', 'chat-state', 'wallpaper-state', 'wallpaper-pick', 'deck-state', 'deck-start', 'update-state', 'update-check', 'dock-state', 'codex-status', 'codex-connect'];
const SEND = ['open-settings', 'welcome-done', 'settings-titlebar', 'hotkeys-pause', 'media', 'seek', 'volume', 'mute', 'mic-toggle',
  'brightness', 'power-mode', 'radio', 'audio-devices', 'audio-set','controls-refresh', 'open-uri', 'clip-copy', 'clip-drag', 'clip-pin', 'clip-remove', 'clips-clear',
  'file-open', 'file-show', 'file-drag', 'phone-stop', 'notice-remove', 'notices-clear', 'notice-open', 'reminder-answer',
  'screenshot', 'snip', 'rec-chunk', 'rec-stop', 'launch', 'stats-on', 'weather-refresh', 'notes-set', 'rects', 'hold',
  'close-island', 'pin-open', 'web-open', 'web-pins', 'web-cmd',
  'chat-pin', 'chat-toggle', 'deck-stop', 'deck-forget', 'deck-reset', 'deck-answer', 'open-author', 'update-answer', 'dock-hover', 'dock-click', 'dock-menu', 'dock-key', 'focus-state', 'dock-tray', 'dock-tray-menu', 'dock-width', 'dock-np', 'file-menu', 'widgets-menu', 'agent-answer', 'ai-usage-refresh'];
const ON = ['open', 'settings', 'screen', 'media', 'thumb', 'vol', 'mic', 'hud', 'inuse', 'bright', 'power', 'radios', 'devices',
  'clips', 'files', 'phone', 'notices', 'banner', 'agents', 'reminders', 'reminder-fire', 'stats', 'weather', 'lyrics',
  'focus-toggle', 'record-toggle', 'hotkey-errors', 'goto', 'calendar', 'game', 'obs', 'web-info', 'covered', 'app-icon', 'cursor', 'settings-pos', 'settings-focus',
  'chat', 'chat-state', 'wallpaper', 'deck', 'deck-pair', 'capture', 'capture-since','update-state', 'update-alert', 'dock', 'goto-tab', 'download', 'agent-ask', 'agent-ask-done', 'ai-usage'];

contextBridge.exposeInMainWorld('wyspa', {
  invoke: (ch, ...a) => INVOKE.includes(ch) ? ipcRenderer.invoke(ch, ...a) : Promise.reject(new Error('kanał ' + ch)),
  send: (ch, ...a) => { if (SEND.includes(ch)) ipcRenderer.send(ch, ...a); },
  on: (ch, fn) => { if (ON.includes(ch)) ipcRenderer.on(ch, (_, d) => fn(d)); },
  pathsFor: files => Array.from(files).map(f => webUtils.getPathForFile(f)).filter(Boolean),
  platform: process.platform,
});
