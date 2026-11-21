// Karta Web (obce strony, piaskownica): powiadomienia stron (np. Messenger) zamiast okienka systemowego trafiają na wyspę.
// Strona dostaje własną wersję Notification i showNotification, która przekazuje tylko tytuł i treść (bez obrazków,
// bez dostępu do czegokolwiek innego). Aura sama ogranicza liczbę i długość takich powiadomień.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__auraNotify', (title, body, tag) => {
  ipcRenderer.send('web-notify', { title: String(title || '').slice(0, 120), body: String(body || '').slice(0, 240), tag: String(tag || '').slice(0, 80) });
});

try {
  contextBridge.executeInMainWorld({
    func: () => {
      const send = (t, o) => { try { window.__auraNotify(t, o && o.body, o && o.tag); } catch {} };
      class AuraNotification extends EventTarget {
        constructor(title, opts = {}) {
          super();
          this.title = String(title || ''); this.body = String(opts.body || ''); this.tag = String(opts.tag || ''); this.data = opts.data;
          this.onclick = null; this.onclose = null; this.onerror = null; this.onshow = null;
          send(this.title, opts);
          setTimeout(() => { const e = new Event('show'); this.dispatchEvent(e); if (typeof this.onshow === 'function') this.onshow(e); }, 0);
        }
        close() {}
        static get permission() { return 'granted'; }
        static requestPermission(cb) { if (typeof cb === 'function') cb('granted'); return Promise.resolve('granted'); }
        static get maxActions() { return 0; }
      }
      window.Notification = AuraNotification;
      if (window.ServiceWorkerRegistration) {
        ServiceWorkerRegistration.prototype.showNotification = function (title, opts) { send(title, opts || {}); return Promise.resolve(); };
        ServiceWorkerRegistration.prototype.getNotifications = function () { return Promise.resolve([]); };
      }
      // strony pytają też przez navigator.permissions — dla powiadomień odpowiadamy „granted”
      if (navigator.permissions && navigator.permissions.query) {
        const q = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = d => (d && d.name === 'notifications')
          ? Promise.resolve({ state: 'granted', status: 'granted', onchange: null, addEventListener() {}, removeEventListener() {} })
          : q(d);
      }
    },
  });
} catch {}
