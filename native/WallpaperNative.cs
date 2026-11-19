// Wyspa - animowana tapeta: wkłada okno pod ikony pulpitu (za SHELLDLL_DefView) i sprząta po sobie.
// Dwa układy pulpitu:
//  - Windows 10 / 11 do 23H2: po komunikacie 0x052C Progman tworzy osobne okno WorkerW za ikonami -> SetParent(okno, WorkerW);
//  - Windows 11 24H2+: SHELLDLL_DefView i WorkerW są dziećmi Progman -> SetParent(okno, Progman) i wstawienie zaraz pod DefView.
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class WyspaWallpaper {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool RedrawWindow(IntPtr h, IntPtr rc, IntPtr rgn, uint flags);
  [DllImport("user32.dll")] static extern bool MapWindowPoints(IntPtr from, IntPtr to, ref RECT r, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SystemParametersInfo(uint action, uint p, StringBuilder v, uint flags);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }

  const int GWL_STYLE = -16, GWL_EXSTYLE = -20;
  const long WS_CHILD = 0x40000000, WS_POPUP = 0x80000000, WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000;
  const long WS_EX_APPWINDOW = 0x40000, WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x8000000, WS_EX_LAYERED = 0x80000;
  [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte alpha, uint flags);
  const uint SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40, SWP_FRAMECHANGED = 0x20, SWP_NOMOVE = 0x2, SWP_NOSIZE = 0x1;

  static IntPtr Progman() { return FindWindow("Progman", null); }
  // prosi Explorer o utworzenie okna WorkerW za ikonami (nieudokumentowany komunikat, używany przez programy z tapetami)
  static void Spawn(IntPtr progman) {
    IntPtr r;
    SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(0x1), 0, 1000, out r);
    SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out r);
  }
  // zwraca: rodzica dla okna tapety, okno do wstawienia „za” (DefView w 24H2) i nazwę układu
  public static string Find(out IntPtr host, out IntPtr after) {
    host = IntPtr.Zero; after = IntPtr.Zero;
    IntPtr progman = Progman();
    if (progman == IntPtr.Zero) return "brak Progman";
    Spawn(progman);
    IntPtr defInProgman = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
    if (defInProgman != IntPtr.Zero) {
      // Windows 11 24H2+: ikony i WorkerW są dziećmi Progman
      host = progman; after = defInProgman;
      return "24H2";
    }
    // starszy układ: szukamy okna najwyższego poziomu z SHELLDLL_DefView, WorkerW leży zaraz za nim
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      IntPtr dv = FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null);
      if (dv != IntPtr.Zero) { found = FindWindowEx(IntPtr.Zero, h, "WorkerW", null); return false; }
      return true;
    }, IntPtr.Zero);
    if (found == IntPtr.Zero) return "brak WorkerW";
    host = found;
    return "WorkerW";
  }

  // Wkłada okno (HWND z Electrona) pod ikony i rozciąga na cały ekran (x,y,w,h w pikselach fizycznych ekranu).
  public static string Attach(long hwnd, int x, int y, int w, int h) {
    SetProcessDPIAware();
    IntPtr win = new IntPtr(hwnd);
    if (!IsWindow(win)) return "error: złe okno";
    IntPtr host, after;
    string mode = Find(out host, out after);
    if (host == IntPtr.Zero) return "error: " + mode;
    long style = GetWindowLongPtr(win, GWL_STYLE).ToInt64();
    style = (style & ~(WS_POPUP | WS_CAPTION | WS_THICKFRAME)) | WS_CHILD;
    SetWindowLongPtr(win, GWL_STYLE, new IntPtr(style));
    long ex = GetWindowLongPtr(win, GWL_EXSTYLE).ToInt64();
    ex = (ex & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
    // 24H2+: pulpit składa się przez DirectComposition i rysuje tylko „warstwowe” okna-dzieci Progman
    if (mode == "24H2") ex |= WS_EX_LAYERED;
    SetWindowLongPtr(win, GWL_EXSTYLE, new IntPtr(ex));
    if (mode == "24H2") SetLayeredWindowAttributes(win, 0, 255, 0x2 /* LWA_ALPHA */);
    SetParent(win, host);
    // współrzędne ekranu -> współrzędne klienta rodzica (Progman/WorkerW zaczynają się w lewym górnym rogu pulpitu wirtualnego)
    RECT r = new RECT { L = x, T = y, R = x + w, B = y + h };
    MapWindowPoints(IntPtr.Zero, host, ref r, 2);
    SetWindowPos(win, after != IntPtr.Zero ? after : IntPtr.Zero, r.L, r.T, r.R - r.L, r.B - r.T, SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED);
    return "ok: " + mode;
  }

  // Po zamknięciu okna tapety: przerysowanie pulpitu, żeby wróciła zwykła tapeta (bez zmiany jej ustawień).
  public static string Refresh() {
    IntPtr progman = Progman();
    const uint RDW_INVALIDATE = 0x1, RDW_ERASE = 0x4, RDW_ALLCHILDREN = 0x80, RDW_UPDATENOW = 0x100, RDW_FRAME = 0x400;
    uint f = RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN | RDW_UPDATENOW | RDW_FRAME;
    if (progman != IntPtr.Zero) RedrawWindow(progman, IntPtr.Zero, IntPtr.Zero, f);
    EnumWindows((h, l) => {
      StringBuilder c = new StringBuilder(32);
      if (GetClassNameSafe(h, c) == "WorkerW") RedrawWindow(h, IntPtr.Zero, IntPtr.Zero, f);
      return true;
    }, IntPtr.Zero);
    return "ok";
  }
  // Mocniejsze przywrócenie: ponowne ustawienie TEJ SAMEJ tapety (ścieżka z systemu, bez zapisu ustawień).
  // Nie używać przy pokazie slajdów / Windows Spotlight — wtedy wystarcza Refresh().
  public static string Reapply() {
    StringBuilder p = new StringBuilder(1024);
    if (!SystemParametersInfo(0x0073 /* SPI_GETDESKWALLPAPER */, 1024, p, 0) || p.Length == 0) return "brak ścieżki";
    if (!System.IO.File.Exists(p.ToString())) return "brak pliku";
    SystemParametersInfo(0x0014 /* SPI_SETDESKWALLPAPER */, 0, p, 0);
    return "ok";
  }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  static string GetClassNameSafe(IntPtr h, StringBuilder s) { GetClassName(h, s, s.Capacity); return s.ToString(); }

  // Diagnostyka: opis układu pulpitu (do logów).
  public static string Describe() {
    IntPtr host, after;
    string mode = Find(out host, out after);
    return mode + " host=" + host.ToInt64() + " after=" + after.ToInt64();
  }
}
