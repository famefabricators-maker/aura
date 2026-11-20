// Aura — pasek zadań: chowanie paska Windows, lista otwartych okien, przełączanie i skróty systemowe.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class AuraTaskbar {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern void SwitchToThisWindow(IntPtr h, bool alt);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder s, ref int n);
  [DllImport("shell32.dll")] static extern IntPtr SHAppBarMessage(uint msg, ref APPBARDATA d);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] struct APPBARDATA { public int cbSize; public IntPtr hWnd; public uint uCallbackMessage; public uint uEdge; public RECT rc; public IntPtr lParam; }

  const uint ABM_GETSTATE = 4, ABM_SETSTATE = 10;
  const int ABS_AUTOHIDE = 1;
  const int GWL_EXSTYLE = -20, WS_EX_TOOLWINDOW = 0x80, WS_EX_APPWINDOW = 0x40000, WS_EX_NOACTIVATE = 0x8000000;

  static APPBARDATA Bar() { var d = new APPBARDATA(); d.cbSize = Marshal.SizeOf(typeof(APPBARDATA)); d.hWnd = FindWindow("Shell_TrayWnd", null); return d; }
  static List<IntPtr> Trays() {
    var l = new List<IntPtr>();
    IntPtr p = FindWindow("Shell_TrayWnd", null); if (p != IntPtr.Zero) l.Add(p);
    IntPtr s = IntPtr.Zero;
    while ((s = FindWindowEx(IntPtr.Zero, s, "Shell_SecondaryTrayWnd", null)) != IntPtr.Zero) l.Add(s);
    return l;
  }

  // stan paska Windows (bit 1 = autoukrywanie) — zapamiętywany, żeby po wyłączeniu wrócił dokładnie taki sam
  public static int GetState() { var d = Bar(); return (int)SHAppBarMessage(ABM_GETSTATE, ref d); }
  public static void Hide() {
    var d = Bar(); d.lParam = (IntPtr)ABS_AUTOHIDE; SHAppBarMessage(ABM_SETSTATE, ref d); // obszar roboczy = cały ekran
    foreach (var h in Trays()) ShowWindow(h, 0);                                       // i nie wyskakuje przy dolnej krawędzi
  }
  public static void Restore(int state) {
    foreach (var h in Trays()) ShowWindow(h, 5);
    if (state >= 0) { var d = Bar(); d.lParam = (IntPtr)state; SHAppBarMessage(ABM_SETSTATE, ref d); }
  }

  static string ProcPath(uint pid) {
    IntPtr p = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
    if (p == IntPtr.Zero) return "";
    try { var sb = new StringBuilder(1024); int n = sb.Capacity; return QueryFullProcessImageName(p, 0, sb, ref n) ? sb.ToString() : ""; }
    finally { CloseHandle(p); }
  }

  // okna jak na pasku zadań: widoczne, bez właściciela, nie narzędziowe, nie ukryte przez system (DWM cloak), z tytułem
  // linia: hwnd \t pid \t zminimalizowane \t aktywne \t zmaksymalizowane \t ścieżka exe \t tytuł
  public static string Windows(uint ownPid) {
    var sb = new StringBuilder(); IntPtr fg = GetForegroundWindow();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true;
      int ex = GetWindowLong(h, GWL_EXSTYLE);
      if ((ex & WS_EX_APPWINDOW) == 0 && ((ex & WS_EX_TOOLWINDOW) != 0 || (ex & WS_EX_NOACTIVATE) != 0)) return true;
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      int len = GetWindowTextLength(h); if (len == 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid); if (pid == ownPid) return true;
      var t = new StringBuilder(len + 1); GetWindowText(h, t, t.Capacity);
      string title = t.ToString().Replace('\t', ' ').Replace('\n', ' ').Replace('\r', ' ');
      sb.Append(h.ToInt64()).Append('\t').Append(pid).Append('\t').Append(IsIconic(h) ? 1 : 0).Append('\t').Append(h == fg ? 1 : 0)
        .Append('\t').Append(IsZoomed(h) ? 1 : 0).Append('\t').Append(ProcPath(pid)).Append('\t').Append(title).Append('\n');
      return true;
    }, IntPtr.Zero);
    return sb.ToString();
  }

  // klik w ikonę: zminimalizowane -> przywróć, aktywne -> zminimalizuj, inne -> na wierzch
  public static void Activate(long hv) {
    IntPtr h = new IntPtr(hv);
    if (IsIconic(h)) { ShowWindow(h, 9); SwitchToThisWindow(h, true); return; }
    if (GetForegroundWindow() == h) { ShowWindow(h, 6); return; }
    SwitchToThisWindow(h, true); SetForegroundWindow(h);
  }
  public static void Focus(long hv) { IntPtr h = new IntPtr(hv); if (IsIconic(h)) ShowWindow(h, 9); SwitchToThisWindow(h, true); SetForegroundWindow(h); }
  public static void Close(long hv) { PostMessage(new IntPtr(hv), 0x10, IntPtr.Zero, IntPtr.Zero); }

  // Start = Win, szybkie ustawienia = Win+A, powiadomienia i kalendarz = Win+N
  public static void Keys(string what) {
    byte k = what == "quick" ? (byte)0x41 : what == "notif" ? (byte)0x4E : (byte)0;
    keybd_event(0x5B, 0, 0, UIntPtr.Zero);
    if (k != 0) { keybd_event(k, 0, 0, UIntPtr.Zero); keybd_event(k, 0, 2, UIntPtr.Zero); }
    keybd_event(0x5B, 0, 2, UIntPtr.Zero);
  }
}
