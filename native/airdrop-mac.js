// Aura - AirDrop na macOS: otwiera systemowe okno AirDrop (wybór iPhone'a / Maca) dla podanych plików.
// Uruchamiane: osascript -l JavaScript airdrop-mac.js <ścieżka> [<ścieżka> …]
// Wypisuje: „ok” (okno otwarte), potem „wysłano” / „anulowano”, albo „niedostępny” (AirDrop wyłączony — Aura pokaże menu Udostępnij).
ObjC.import('AppKit');
ObjC.import('stdlib');

function run(argv) {
  const out = s => { $.NSFileHandle.fileHandleWithStandardOutput.writeData($(s + '\n').dataUsingEncoding($.NSUTF8StringEncoding)); };
  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy(1); // „akcesorium”: bez ikony w Docku, ale może pokazać okno AirDrop

  const items = $.NSMutableArray.array;
  for (const p of argv) items.addObject($.NSURL.fileURLWithPath(p));

  const name = (typeof $.NSSharingServiceNameSendViaAirDrop !== 'undefined' && $.NSSharingServiceNameSendViaAirDrop) || $('com.apple.share.AirDrop.send');
  const svc = $.NSSharingService.sharingServiceNamed(name);
  if (!svc || svc.isNil() || !svc.canPerformWithItems(items)) { out('niedostępny'); $.exit(2); }

  // koniec po wysłaniu albo anulowaniu (zamknięciu okna)
  ObjC.registerSubclass({
    name: 'AuraAirDropDelegate',
    protocols: ['NSSharingServiceDelegate'],
    methods: {
      'sharingService:didShareItems:': { types: ['void', ['id', 'id']], implementation: () => { out('wysłano'); $.exit(0); } },
      'sharingService:didFailToShareItems:error:': { types: ['void', ['id', 'id', 'id']], implementation: () => { out('anulowano'); $.exit(1); } },
    },
  });
  const delegate = $.AuraAirDropDelegate.alloc.init;
  svc.delegate = delegate;
  app.activateIgnoringOtherApps(true);
  if (app.activate) { try { app.activate; } catch (e) {} } // macOS 14+: nowe API aktywacji
  svc.performWithItems(items);
  out('ok');
  // Uruchomiony przez Aurę (aplikację w tle) nie dostaje pierwszego planu, więc okno AirDrop zostawało ukryte za innymi.
  // Przez pierwsze 3 s wysuwamy wszystkie nasze okna na wierzch (poziom paneli modalnych, nad zwykłymi oknami).
  for (let i = 0; i < 15; i++) {
    $.NSRunLoop.currentRunLoop.runModeBeforeDate($.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.2));
    const wins = app.windows;
    for (let k = 0; k < wins.count; k++) { const w = wins.objectAtIndex(k); try { w.setLevel(8); w.orderFrontRegardless; w.makeKeyWindow; } catch (e) {} }
  }
  // czekamy na decyzję (najwyżej 10 minut)
  const until = $.NSDate.dateWithTimeIntervalSinceNow(600);
  while ($.NSDate.date.compare(until) < 0) $.NSRunLoop.currentRunLoop.runModeBeforeDate($.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.5));
  $.exit(0);
}
