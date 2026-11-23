// Test na macOS: osobny program z oknem „PLIK”, z którego da się przeciągnąć plik (prawdziwa sesja przeciągania AppKit,
// jak z Findera). Uruchamiany: osascript -l JavaScript .github/mac-drag-source.js <plik> <sekundy>
// Okno: lewy górny róg (40, 260), 240 x 180 punktów. Wypisuje: „gotowe”, „mysz w dół”, „sesja przeciągania”, „koniec: <operacja>”.
ObjC.import('AppKit');
ObjC.import('stdlib');

function run(argv) {
  const file = argv[0], secs = Number(argv[1] || 60);
  const out = s => { $.NSFileHandle.fileHandleWithStandardOutput.writeData($(s + '\n').dataUsingEncoding($.NSUTF8StringEncoding)); };
  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy(1);
  app.finishLaunching;
  let started = false;
  ObjC.registerSubclass({
    name: 'AuraDragSrc', superclass: 'NSView', protocols: ['NSDraggingSource'],
    methods: {
      'acceptsFirstMouse:': { types: ['bool', ['id']], implementation: () => true },
      'mouseDown:': { types: ['void', ['id']], implementation: () => { out('mysz w dół'); } },
      'mouseDragged:': {
        types: ['void', ['id']], implementation: function (ev) {
          if (started) return; started = true;
          const item = $.NSDraggingItem.alloc.initWithPasteboardWriter($.NSURL.fileURLWithPath(file));
          item.setDraggingFrameContents($.NSMakeRect(0, 0, 64, 64), $.NSWorkspace.sharedWorkspace.iconForFile(file));
          this.beginDraggingSessionWithItemsEventSource($([item]), ev, this);
          out('sesja przeciągania');
        },
      },
      'draggingSession:sourceOperationMaskForDraggingContext:': { types: ['unsigned long', ['id', 'long']], implementation: () => { started = false; return 1; } }, // kopiowanie
    },
  });
  const H = $.NSScreen.mainScreen.frame.size.height;
  const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(40, H - 260 - 180, 240, 180), 0, 2, false);
  const view = $.AuraDragSrc.alloc.initWithFrame($.NSMakeRect(0, 0, 240, 180));
  view.wantsLayer = true; view.layer.backgroundColor = $.NSColor.systemGreenColor.CGColor;
  win.contentView = view; win.level = 3; win.makeKeyAndOrderFront(null); app.activateIgnoringOtherApps(true);
  out('gotowe');
  const until = $.NSDate.dateWithTimeIntervalSinceNow(secs);
  while ($.NSDate.date.compare(until) < 0) {
    const e = app.nextEventMatchingMaskUntilDateInModeDequeue(-1, $.NSDate.dateWithTimeIntervalSinceNow(0.1), $.NSDefaultRunLoopMode, true);
    if (e && !e.isNil()) app.sendEvent(e);
  }
  $.exit(0);
}
