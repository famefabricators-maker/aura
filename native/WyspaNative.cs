// Wyspa - natywne funkcje Windows dla pomocnika PowerShell.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

public static class WyspaWin {
  // Oddanie systemowi nieużywanej pamięci pomocnika (sprzątanie .NET + przycięcie zestawu roboczego); wołane co minutę
  [DllImport("kernel32.dll")] static extern bool SetProcessWorkingSetSize(IntPtr p, IntPtr min, IntPtr max);
  public static void Trim() { try { GC.Collect(); GC.WaitForPendingFinalizers(); SetProcessWorkingSetSize(System.Diagnostics.Process.GetCurrentProcess().Handle, (IntPtr)(-1), (IntPtr)(-1)); } catch { } }
  // to samo dla procesu głównego Aury (Electron): po starcie trzyma ok. 150 MB, z czego większość leży nieużywana;
  // okna wyspy i grafiki nie ruszamy — ich pamięć jest w ciągłym użyciu (przycięcie dawałoby przycinki animacji)
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static void TrimPid(int pid) {
    if (pid <= 0) return;
    IntPtr h = OpenProcess(0x0100 | 0x0400, false, pid); // PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION
    if (h == IntPtr.Zero) return;
    try { SetProcessWorkingSetSize(h, (IntPtr)(-1), (IntPtr)(-1)); } finally { CloseHandle(h); }
  }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
  [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(POINT p, uint f);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint RegisterClipboardFormat(string name);
  [DllImport("user32.dll")] static extern bool IsClipboardFormatAvailable(uint f);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern short GetKeyState(int vk);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("gdi32.dll")] static extern uint GetPixel(IntPtr dc, int x, int y);

  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }

  static uint fmtExclude, fmtIgnore, fmtHistory;

  public static void Init() {
    try { SetProcessDPIAware(); } catch { }
    fmtExclude = RegisterClipboardFormat("ExcludeClipboardContentFromMonitorProcessing");
    fmtIgnore = RegisterClipboardFormat("Clipboard Viewer Ignore");
    fmtHistory = RegisterClipboardFormat("CanIncludeInClipboardHistory");
  }

  // Menedzery hasel oznaczaja kopie, zeby historia schowka ich nie zapisywala.
  public static bool ClipboardIsPrivate() {
    try { return IsClipboardFormatAvailable(fmtExclude) || IsClipboardFormatAvailable(fmtIgnore); }
    catch { return false; }
  }

  public static int ForegroundPid() {
    uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); return (int)pid;
  }

  public static bool IsFullscreen() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return false;
    var sb = new StringBuilder(256);
    GetClassName(h, sb, 256);
    string c = sb.ToString();
    if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd") return false;
    // zmaksymalizowane okno to nie pełny ekran (gdy pasek Windows jest schowany, też zajmuje cały monitor)
    if (IsZoomed(h)) return false;
    RECT r;
    if (!GetWindowRect(h, out r)) return false;
    IntPtr m = MonitorFromWindow(h, 2);
    var mi = new MONITORINFO();
    mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
    if (!GetMonitorInfo(m, ref mi)) return false;
    if ((mi.dwFlags & 1) == 0) return false;
    return r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
  }

  // Czy aplikacja na pierwszym planie zasłania krawędź z wyspą (np. zmaksymalizowana przeglądarka)?
  // Liczą się WSZYSTKIE widoczne okna tej aplikacji, nie tylko to z fokusem: panel boczny Opery (Messenger)
  // to osobne, wąskie okienko — gdy dostaje fokus, przeglądarka pod nim dalej zasłania krawędź.
  // bottom = wyspa na dole ekranu. -1 = to okno samej Wyspy (nie zmieniaj stanu), 0 = nie, 1 = tak.
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lp);
  delegate bool EnumProc(IntPtr h, IntPtr lp);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);
  public static int TopCovered(int ownPid) { return EdgeCovered(ownPid, false); }
  public static int EdgeCovered(int ownPid, bool bottom) {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return 0;
    uint pid; GetWindowThreadProcessId(h, out pid);
    if (ownPid > 0 && pid == (uint)ownPid) return -1;
    var sb = new StringBuilder(256);
    GetClassName(h, sb, 256);
    string c = sb.ToString();
    if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd" || c == "Windows.UI.Core.CoreWindow" || c == "XamlExplorerHostIslandWindow") return 0;
    // ekran główny (tam jest wyspa)
    IntPtr m = MonitorFromWindow(GetDesktopWindow(), 1);
    var mi = new MONITORINFO();
    mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
    if (!GetMonitorInfo(m, ref mi)) return 0;
    int cx = (mi.rcMonitor.L + mi.rcMonitor.R) / 2;
    bool hit = false;
    EnumWindows((w, lp) => {
      uint wp; GetWindowThreadProcessId(w, out wp);
      if (wp != pid || !IsWindowVisible(w) || IsIconic(w)) return true;
      int cloaked; if (DwmGetWindowAttribute(w, 14, out cloaked, 4) == 0 && cloaked != 0) return true; // ukryte karty/pulpity
      RECT r; if (!GetWindowRect(w, out r)) return true;
      bool wide = r.L <= cx - 200 && r.R >= cx + 200;
      bool edge = bottom ? (r.B >= mi.rcWork.B - 12 && r.T < mi.rcWork.B - 200) : (r.T <= mi.rcWork.T + 12 && r.B > mi.rcWork.T + 200);
      if (wide && edge) { hit = true; return false; }
      return true;
    }, IntPtr.Zero);
    return hit ? 1 : 0;
  }

  public static int LockKeys() {
    int v = 0;
    if ((GetKeyState(0x14) & 1) != 0) v |= 1; // Caps Lock
    if ((GetKeyState(0x90) & 1) != 0) v |= 2; // Num Lock
    return v;
  }

  public static string PickColor() {
    POINT p; GetCursorPos(out p);
    IntPtr dc = GetDC(IntPtr.Zero);
    uint c = GetPixel(dc, p.X, p.Y);
    ReleaseDC(IntPtr.Zero, dc);
    return string.Format("#{0:X2}{1:X2}{2:X2}", c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF);
  }

  // Ktore aplikacje uzywaja teraz mikrofonu / kamery (ustawienia prywatnosci Windows).
  public static string InUse(string capability) {
    var list = new List<string>();
    try {
      using (var root = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\" + capability)) {
        if (root == null) return "";
        Scan(root, list, false);
        using (var np = root.OpenSubKey("NonPackaged")) { if (np != null) Scan(np, list, true); }
      }
    } catch { }
    return string.Join("|", list.ToArray());
  }
  static void Scan(RegistryKey key, List<string> list, bool nonPackaged) {
    foreach (var name in key.GetSubKeyNames()) {
      if (name == "NonPackaged") continue;
      using (var k = key.OpenSubKey(name)) {
        if (k == null) continue;
        object stop = k.GetValue("LastUsedTimeStop");
        object start = k.GetValue("LastUsedTimeStart");
        if (start is long && (long)start > 0 && stop is long && (long)stop == 0) {
          string n = nonPackaged ? name.Substring(name.LastIndexOf('#') + 1) : name.Split('_')[0];
          // nazwa*FILETIME startu — z tego liczymy prawdziwy czas rozmowy
          string entry = n + "*" + ((long)start).ToString();
          int i = list.FindIndex(x => x.StartsWith(n + "*"));
          if (i < 0) list.Add(entry);
          else if (long.Parse(list[i].Substring(n.Length + 1)) > (long)start) list[i] = entry; // najwcześniejszy start
        }
      }
    }
  }

  // --- tryb zasilania Windows (Bateria / Zrownowazony / Wydajnosc) ---
  [DllImport("powrprof.dll")] static extern uint PowerGetEffectiveOverlayScheme(out Guid g);
  [DllImport("powrprof.dll")] static extern uint PowerSetActiveOverlayScheme(Guid g);
  public static string PowerMode() { try { Guid g; return PowerGetEffectiveOverlayScheme(out g) == 0 ? g.ToString() : ""; } catch { return ""; } }
  public static bool SetPowerMode(string guid) { try { return PowerSetActiveOverlayScheme(new Guid(guid)) == 0; } catch { return false; } }

  // --- jasnosc monitorow zewnetrznych (DDC/CI) ---
  [DllImport("dxva2.dll")] static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMon, out uint n);
  [DllImport("dxva2.dll")] static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMon, uint n, [Out] PHYSICAL_MONITOR[] arr);
  [DllImport("dxva2.dll")] static extern bool GetMonitorBrightness(IntPtr h, out uint min, out uint cur, out uint max);
  [DllImport("dxva2.dll")] static extern bool SetMonitorBrightness(IntPtr h, uint v);
  [DllImport("dxva2.dll")] static extern bool DestroyPhysicalMonitors(uint n, PHYSICAL_MONITOR[] arr);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct PHYSICAL_MONITOR { public IntPtr h; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string desc; }

  static PHYSICAL_MONITOR[] Physical() {
    IntPtr mon = MonitorFromPoint(new POINT(), 1);
    uint n;
    if (!GetNumberOfPhysicalMonitorsFromHMONITOR(mon, out n) || n == 0) return null;
    var arr = new PHYSICAL_MONITOR[n];
    if (!GetPhysicalMonitorsFromHMONITOR(mon, n, arr)) return null;
    return arr;
  }
  public static int DdcGet() {
    var arr = Physical(); if (arr == null) return -1;
    int res = -1;
    try {
      uint min, cur, max;
      if (GetMonitorBrightness(arr[0].h, out min, out cur, out max) && max > min) res = (int)Math.Round(100.0 * (cur - min) / (max - min));
    } finally { DestroyPhysicalMonitors((uint)arr.Length, arr); }
    return res;
  }
  public static bool DdcSet(int pct) {
    var arr = Physical(); if (arr == null) return false;
    bool ok = false;
    try {
      foreach (var m in arr) {
        uint min, cur, max;
        if (GetMonitorBrightness(m.h, out min, out cur, out max)) ok |= SetMonitorBrightness(m.h, (uint)(min + (max - min) * pct / 100.0));
      }
    } finally { DestroyPhysicalMonitors((uint)arr.Length, arr); }
    return ok;
  }
}

// ---------- dzwiek (Core Audio) ----------
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr p);
  int UnregisterControlChangeNotify(IntPtr p);
  int GetChannelCount(out uint n);
  int SetMasterVolumeLevel(float db, ref Guid ctx);
  int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
  int GetMasterVolumeLevel(out float db);
  int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(uint ch, float db, ref Guid ctx);
  int SetChannelVolumeLevelScalar(uint ch, float level, ref Guid ctx);
  int GetChannelVolumeLevel(uint ch, out float db);
  int GetChannelVolumeLevelScalar(uint ch, out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
[ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPropertyStore {
  int GetCount(out uint n);
  int GetAt(uint i, out PropertyKey key);
  int GetValue(ref PropertyKey key, out PropVariant pv);
  int SetValue(ref PropertyKey key, ref PropVariant pv);
  int Commit();
}
[StructLayout(LayoutKind.Sequential)] struct PropertyKey { public Guid fmtid; public int pid; }
[StructLayout(LayoutKind.Explicit)] struct PropVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(16)] public IntPtr p2; }
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  int OpenPropertyStore(int access, out IPropertyStore store);
  int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  int GetState(out int state);
}
// Sesje audio: która aplikacja w tej chwili naprawdę nagrywa z mikrofonu (stan „Active”).
[ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl {
  int GetState(out int state);
}
[ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
  int GetState(out int state);
  int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
  int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid ctx);
  int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
  int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid ctx);
  int GetGroupingParam(out Guid g);
  int SetGroupingParam(ref Guid g, ref Guid ctx);
  int RegisterAudioSessionNotification(IntPtr n);
  int UnregisterAudioSessionNotification(IntPtr n);
  int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
  int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
  int GetProcessId(out uint pid);
}
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator {
  int GetCount(out int n);
  int GetSession(int i, out IAudioSessionControl2 s);
}
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
  int GetAudioSessionControl(IntPtr guid, int flags, out IntPtr ctl);
  int GetSimpleAudioVolume(IntPtr guid, int flags, out IntPtr vol);
  int GetSessionEnumerator(out IAudioSessionEnumerator e);
}
[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection {
  int GetCount(out uint n);
  int Item(uint i, out IMMDevice dev);
}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(int flow, int mask, out IMMDeviceCollection devices);
  int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }
// Ustawienie domyślnego urządzenia (nieudokumentowane, ale stabilne od Windows 7 — używa go m.in. panel dźwięku).
[ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPolicyConfig {
  int GetMixFormat(); int GetDeviceFormat(); int ResetDeviceFormat(); int SetDeviceFormat();
  int GetProcessingPeriod(); int SetProcessingPeriod(); int GetShareMode(); int SetShareMode();
  int GetPropertyValue(); int SetPropertyValue();
  int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
  int SetEndpointVisibility();
}
[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class PolicyConfigClient { }

public static class WyspaAudio {
  static IMMDeviceEnumerator en;
  static readonly string[] ids = new string[2];
  static readonly IAudioEndpointVolume[] vols = new IAudioEndpointVolume[2];
  static readonly string[] names = new string[2];

  // flow: 0 = glosniki, 1 = mikrofon
  static IAudioEndpointVolume Vol(int flow) {
    if (en == null) en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
    IMMDevice dev;
    if (en.GetDefaultAudioEndpoint(flow, flow == 1 ? 2 : 0, out dev) != 0 || dev == null) { vols[flow] = null; ids[flow] = null; return null; }
    string id; dev.GetId(out id);
    if (id != ids[flow] || vols[flow] == null) {
      ids[flow] = id;
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      object o; dev.Activate(ref iid, 23, IntPtr.Zero, out o);
      vols[flow] = (IAudioEndpointVolume)o;
      names[flow] = Name(dev);
    }
    return vols[flow];
  }
  static string Name(IMMDevice dev) {
    try {
      IPropertyStore store; dev.OpenPropertyStore(0, out store);
      var key = new PropertyKey { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };
      PropVariant pv; store.GetValue(ref key, out pv);
      return pv.vt == 31 ? Marshal.PtrToStringUni(pv.p) : "";
    } catch { return ""; }
  }
  // Aktywne urządzenia: rekordy "id\x1fnazwa\x1f1 gdy domyślne", oddzielone \x1e
  public static string Devices(int flow) {
    var list = new List<string>();
    try {
      if (en == null) en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
      string def = null; IMMDevice d0;
      if (en.GetDefaultAudioEndpoint(flow, flow == 1 ? 2 : 0, out d0) == 0 && d0 != null) d0.GetId(out def);
      IMMDeviceCollection col; en.EnumAudioEndpoints(flow, 1, out col);
      uint n; col.GetCount(out n);
      for (uint i = 0; i < n; i++) {
        IMMDevice dev; col.Item(i, out dev); string id; dev.GetId(out id);
        list.Add(id + "\x1f" + Name(dev) + "\x1f" + (id == def ? "1" : "0"));
      }
    } catch { }
    return string.Join("\x1e", list.ToArray());
  }
  // Domyślne urządzenie dla wszystkich ról (konsola, multimedia, komunikacja) — jak wybór w panelu Windows
  public static bool SetDefault(string id) {
    try {
      var pc = (IPolicyConfig)new PolicyConfigClient();
      for (int role = 0; role < 3; role++) pc.SetDefaultEndpoint(id, role);
      return true;
    } catch { return false; }
  }
  public static string State(int flow) {
    try {
      var v = Vol(flow); if (v == null) return "";
      float level; bool mute;
      v.GetMasterVolumeLevelScalar(out level); v.GetMute(out mute);
      return string.Format(System.Globalization.CultureInfo.InvariantCulture, "{0:0.000}|{1}|{2}|{3}", level, mute ? 1 : 0, names[flow], ids[flow]);
    } catch { vols[flow] = null; return ""; }
  }
  public static void SetLevel(int flow, float level) {
    try { var v = Vol(flow); Guid g = Guid.Empty; if (v != null) { v.SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, level)), ref g); if (level > 0) v.SetMute(false, ref g); } } catch { }
  }
  public static void SetMute(int flow, bool mute) {
    try { var v = Vol(flow); Guid g = Guid.Empty; if (v != null) v.SetMute(mute, ref g); } catch { }
  }
  // Nazwy procesów, które W TEJ CHWILI nagrywają z dowolnego mikrofonu (aktywna sesja audio).
  public static string CaptureActive() {
    var names = new List<string>();
    try {
      if (en == null) en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
      IMMDeviceCollection col; en.EnumAudioEndpoints(1, 1, out col);
      uint n; col.GetCount(out n);
      Guid iid = typeof(IAudioSessionManager2).GUID;
      for (uint i = 0; i < n; i++) {
        try {
          IMMDevice dev; col.Item(i, out dev);
          object o; dev.Activate(ref iid, 23, IntPtr.Zero, out o);
          IAudioSessionEnumerator se; ((IAudioSessionManager2)o).GetSessionEnumerator(out se);
          int c; se.GetCount(out c);
          for (int j = 0; j < c; j++) {
            try {
              IAudioSessionControl2 s; se.GetSession(j, out s);
              int st; s.GetState(out st);
              if (st != 1) continue; // 1 = aktywna
              uint pid; s.GetProcessId(out pid);
              if (pid == 0) continue;
              string name = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName;
              if (!names.Contains(name)) names.Add(name);
            } catch { }
          }
        } catch { }
      }
    } catch { }
    names.Sort();
    return string.Join("|", names.ToArray());
  }
  // Wycisza / wlacza WSZYSTKIE aktywne mikrofony - dziala we wszystkich aplikacjach naraz.
  public static void MuteAllMics(bool mute) {
    try {
      if (en == null) en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
      IMMDeviceCollection col; en.EnumAudioEndpoints(1, 1, out col);
      uint n; col.GetCount(out n);
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      for (uint i = 0; i < n; i++) {
        IMMDevice dev; col.Item(i, out dev);
        object o; dev.Activate(ref iid, 23, IntPtr.Zero, out o);
        Guid g = Guid.Empty; ((IAudioEndpointVolume)o).SetMute(mute, ref g);
      }
    } catch { }
  }
}

// Bateria urządzeń bezprzewodowych: Bluetooth (to, co Windows pokazuje w Ustawieniach) oraz urządzenia SteelSeries
// na odbiorniku 2,4 GHz, odczytywane wprost przez HID (tak jak w otwartych projektach rivalcfg i HeadsetControl):
//  - Aerox 3 Wireless (odbiornik 0x1838 / 0x1878, interfejs 3): raport 00 D2, odpowiedź D2 xx, poziom = ((xx & 0x7F) - 1) * 5, ładowanie = xx & 0x80
//  - Arctis 7 / Pro (0x1260, 0x12AD, 0x1252, 0x1280; interfejs 5, strona 0xFF43 / 0x0202): raport 06 18, bajt 2 = procent
// Odczyt w osobnym wątku (co 30 s albo od razu po podłączeniu/odłączeniu); pomocnik PowerShell bierze gotowy wynik (Version rośnie przy zmianie).
public static class WyspaDevBattery {
  [StructLayout(LayoutKind.Sequential)] struct SP_DEVICE_INTERFACE_DATA { public int cbSize; public Guid g; public int flags; public IntPtr r; }
  [StructLayout(LayoutKind.Sequential)] struct SP_DEVINFO_DATA { public int cbSize; public Guid g; public int inst; public IntPtr r; }
  [StructLayout(LayoutKind.Sequential)] struct DEVPROPKEY { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Sequential)] struct HIDP_CAPS { public ushort Usage, UsagePage, InLen, OutLen, FeatLen; [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)] public ushort[] r; public ushort a, b, c, d, e, f, g, h, i, j; }
  [StructLayout(LayoutKind.Sequential)] struct OVL { public IntPtr Internal, InternalHigh; public int Offset, OffsetHigh; public IntPtr hEvent; }
  [DllImport("hid.dll")] static extern void HidD_GetHidGuid(out Guid g);
  [DllImport("hid.dll")] static extern bool HidD_GetPreparsedData(IntPtr h, out IntPtr p);
  [DllImport("hid.dll")] static extern bool HidD_FreePreparsedData(IntPtr p);
  [DllImport("hid.dll")] static extern int HidP_GetCaps(IntPtr p, out HIDP_CAPS c);
  [DllImport("setupapi.dll", CharSet = CharSet.Unicode, EntryPoint = "SetupDiGetClassDevsW")] static extern IntPtr ClassDevs(ref Guid g, IntPtr e, IntPtr w, int f);
  [DllImport("setupapi.dll", CharSet = CharSet.Unicode, EntryPoint = "SetupDiGetClassDevsW")] static extern IntPtr ClassDevsAll(IntPtr g, IntPtr e, IntPtr w, int f);
  [DllImport("setupapi.dll")] static extern bool SetupDiEnumDeviceInterfaces(IntPtr s, IntPtr d, ref Guid g, int i, ref SP_DEVICE_INTERFACE_DATA o);
  [DllImport("setupapi.dll", CharSet = CharSet.Unicode)] static extern bool SetupDiGetDeviceInterfaceDetailW(IntPtr s, ref SP_DEVICE_INTERFACE_DATA d, IntPtr o, int size, out int req, IntPtr di);
  [DllImport("setupapi.dll")] static extern bool SetupDiEnumDeviceInfo(IntPtr s, int i, ref SP_DEVINFO_DATA d);
  [DllImport("setupapi.dll", CharSet = CharSet.Unicode)] static extern bool SetupDiGetDevicePropertyW(IntPtr s, ref SP_DEVINFO_DATA d, ref DEVPROPKEY k, out uint type, byte[] buf, int size, out int req, int flags);
  [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr s);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateFileW(string n, uint a, uint sh, IntPtr sa, uint c, uint f, IntPtr t);
  [DllImport("kernel32.dll")] static extern bool WriteFile(IntPtr h, byte[] b, int n, out int w, ref OVL o);
  [DllImport("kernel32.dll")] static extern bool ReadFile(IntPtr h, byte[] b, int n, out int r, ref OVL o);
  [DllImport("kernel32.dll")] static extern bool GetOverlappedResult(IntPtr h, ref OVL o, out int n, bool wait);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll")] static extern bool CancelIoEx(IntPtr h, IntPtr o);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern IntPtr CreateEventW(IntPtr a, bool manual, bool init, IntPtr n);
  [DllImport("kernel32.dll")] static extern bool ResetEvent(IntPtr h);

  public static int Version;
  public static string Result = "";   // linie: nazwa \t rodzaj \t procent \t ładowanie(0/1)
  static System.Threading.Thread worker;
  public static volatile bool Enabled = true;
  public static void Start() {
    if (worker != null) return;
    // co 3 s: czy zmieniły się podłączone urządzenia (np. mysz wpięta kablem do ładowania) — wtedy odczyt od razu; poza tym co 30 s
    worker = new System.Threading.Thread(() => {
      string sig = null; DateTime last = DateTime.MinValue;
      while (true) {
        if (Enabled) {
          string now = ""; try { foreach (var p in HidPaths()) { string l = p.ToLowerInvariant(); if (l.Contains("vid_1038") && (l.Contains("mi_03") || l.Contains("mi_05"))) now += l + "|"; } } catch { }
          if (now != sig || (DateTime.Now - last).TotalSeconds >= 30) { if (sig != null && now != sig) System.Threading.Thread.Sleep(1500); sig = now; last = DateTime.Now; Update(); }
        }
        System.Threading.Thread.Sleep(3000);
      }
    });
    worker.IsBackground = true; worker.Priority = System.Threading.ThreadPriority.BelowNormal;
    worker.Start();
  }
  static readonly object gate = new object();
  static void Update() { lock (gate) { string r = ""; try { r = ReadAll(); } catch { } if (r != Result) { Result = r; Version++; } } }
  public static void Refresh() { var t = new System.Threading.Thread(Update); t.IsBackground = true; t.Start(); }
  public static string Test() { return ReadAll(); } // do sprawdzania z PowerShella

  static string ReadAll() {
    var sb = new StringBuilder(); var seen = new HashSet<string>();
    foreach (var d in SteelSeries()) if (seen.Add(d.Split('\t')[0])) sb.Append(d).Append('\n');
    foreach (var d in Bluetooth()) if (seen.Add(d.Split('\t')[0])) sb.Append(d).Append('\n');
    return sb.ToString();
  }

  static List<string> HidPaths() {
    var list = new List<string>(); Guid g; HidD_GetHidGuid(out g);
    IntPtr set = ClassDevs(ref g, IntPtr.Zero, IntPtr.Zero, 0x12); // obecne + interfejsy
    if (set == (IntPtr)(-1)) return list;
    try {
      var d = new SP_DEVICE_INTERFACE_DATA(); d.cbSize = Marshal.SizeOf(d);
      for (int i = 0; SetupDiEnumDeviceInterfaces(set, IntPtr.Zero, ref g, i, ref d); i++) {
        int req; SetupDiGetDeviceInterfaceDetailW(set, ref d, IntPtr.Zero, 0, out req, IntPtr.Zero);
        if (req <= 0) continue;
        IntPtr buf = Marshal.AllocHGlobal(req);
        try {
          Marshal.WriteInt32(buf, IntPtr.Size == 8 ? 8 : 6);
          if (SetupDiGetDeviceInterfaceDetailW(set, ref d, buf, req, out req, IntPtr.Zero)) list.Add(Marshal.PtrToStringUni(new IntPtr(buf.ToInt64() + 4)));
        } finally { Marshal.FreeHGlobal(buf); }
      }
    } finally { SetupDiDestroyDeviceInfoList(set); }
    return list;
  }
  // zapytanie: wyślij raport wyjściowy, czytaj raporty wejściowe (do 8, każdy do 600 ms), aż któryś pasuje;
  // bezprzewodowa mysz odpowiada z opóźnieniem, a odbiornik potrafi wcześniej przysłać inny raport — wtedy druga próba
  static byte[] Ask(string path, byte[] cmd, Func<byte[], bool> match, ushort page, ushort usage) {
    for (int t = 0; t < 2; t++) { var r = AskOnce(path, cmd, match, page, usage); if (r != null) return r; }
    return null;
  }
  static byte[] AskOnce(string path, byte[] cmd, Func<byte[], bool> match, ushort page, ushort usage) {
    IntPtr h = CreateFileW(path, 0xC0000000, 3, IntPtr.Zero, 3, 0x40000000, IntPtr.Zero);
    if (h == (IntPtr)(-1)) return null;
    IntPtr ev = CreateEventW(IntPtr.Zero, true, false, IntPtr.Zero);
    try {
      IntPtr pp; HIDP_CAPS caps;
      if (!HidD_GetPreparsedData(h, out pp)) return null;
      try { HidP_GetCaps(pp, out caps); } finally { HidD_FreePreparsedData(pp); }
      if (page != 0 && (caps.UsagePage != page || caps.Usage != usage)) return null;
      if (caps.OutLen < cmd.Length || caps.InLen < 3) return null;
      var o = new byte[caps.OutLen]; Array.Copy(cmd, o, cmd.Length);
      var ov = new OVL(); ov.hEvent = ev; int n;
      if (!WriteFile(h, o, o.Length, out n, ref ov)) {
        if (WaitForSingleObject(ev, 300) != 0) { CancelIoEx(h, IntPtr.Zero); GetOverlappedResult(h, ref ov, out n, true); return null; }
      }
      for (int k = 0; k < 8; k++) {
        ResetEvent(ev);
        var inb = new byte[caps.InLen]; var ri = new OVL(); ri.hEvent = ev;
        if (!ReadFile(h, inb, inb.Length, out n, ref ri)) {
          if (WaitForSingleObject(ev, 600) != 0) { CancelIoEx(h, IntPtr.Zero); GetOverlappedResult(h, ref ri, out n, true); return null; }
        }
        if (match(inb)) return inb;
      }
      return null;
    } catch { return null; }
    finally { CloseHandle(ev); CloseHandle(h); }
  }
  // Słuchawki Arctis nie zgłaszają ładowania. Bateria rośnie jednak tylko przy ładowaniu (po podpięciu odczyt od razu
  // podskakuje), a po odłączeniu spada — więc wzrost = ładuje się, spadek = już nie.
  static readonly Dictionary<string, int> lastLvl = new Dictionary<string, int>();
  static readonly Dictionary<string, bool> charging = new Dictionary<string, bool>();
  static bool Charging(string name, int lvl) {
    int prev; bool c; charging.TryGetValue(name, out c);
    if (lastLvl.TryGetValue(name, out prev)) { if (lvl > prev) c = true; else if (lvl < prev) c = false; }
    lastLvl[name] = lvl; charging[name] = c; return c;
  }
  static List<string> SteelSeries() {
    var outl = new List<string>();
    foreach (var p in HidPaths()) {
      string l = p.ToLowerInvariant(); if (!l.Contains("vid_1038")) continue;
      bool wired = l.Contains("pid_183a") || l.Contains("pid_187a");   // mysz na kablu (ładowanie): ta sama mysz, komenda bez bitu „bezprzewodowo”
      if ((l.Contains("pid_1838") || l.Contains("pid_1878") || wired) && l.Contains("mi_03")) {
        byte cmd = (byte)(wired ? 0x92 : 0xD2);
        var r = Ask(p, new byte[] { 0x00, cmd }, b => b[1] == cmd, 0, 0); // odpowiedź: [ID 0] komenda poziom
        if (r == null) continue;
        int raw = r[2], lvl = ((raw & 0x7F) - 1) * 5;
        if (lvl < 0 || lvl > 100) continue;                                // mysz wyłączona albo uśpiona
        outl.Add("SteelSeries Aerox 3\tmouse\t" + lvl + "\t" + ((raw & 0x80) != 0 ? 1 : 0));
      } else if ((l.Contains("pid_12ad") || l.Contains("pid_1260") || l.Contains("pid_1252") || l.Contains("pid_1280")) && l.Contains("mi_05")) {
        var r = Ask(p, new byte[] { 0x06, 0x18 }, b => b[0] == 0x06 && b[1] == 0x18, 0xFF43, 0x0202);
        if (r == null) continue;
        int lvl = r[2];
        if (lvl <= 0 || lvl > 100) continue;                               // słuchawki wyłączone
        string nm = l.Contains("pid_1252") || l.Contains("pid_1280") ? "SteelSeries Arctis Pro" : "SteelSeries Arctis 7";
        outl.Add(nm + "\theadset\t" + lvl + "\t" + (Charging(nm, lvl) ? 1 : 0));
      }
    }
    return outl;
  }
  // Bluetooth: właściwość „poziom baterii” urządzenia, nazwa z FriendlyName, rodzaj z klasy
  static List<string> Bluetooth() {
    var outl = new List<string>();
    IntPtr set = ClassDevsAll(IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0x06); // wszystkie klasy, obecne
    if (set == (IntPtr)(-1)) return outl;
    try {
      var bat = new DEVPROPKEY(); bat.fmtid = new Guid("104EA319-6EE2-4701-BD47-8DDBF425BBE5"); bat.pid = 2;
      var name = new DEVPROPKEY(); name.fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"); name.pid = 14;
      var cls = new DEVPROPKEY(); cls.fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"); cls.pid = 10;
      var d = new SP_DEVINFO_DATA(); d.cbSize = Marshal.SizeOf(d);
      var buf = new byte[512];
      for (int i = 0; SetupDiEnumDeviceInfo(set, i, ref d); i++) {
        uint t; int req;
        if (!SetupDiGetDevicePropertyW(set, ref d, ref bat, out t, buf, buf.Length, out req, 0) || req < 1) continue;
        int lvl = buf[0]; if (lvl > 100) continue;
        string n = "";
        if (SetupDiGetDevicePropertyW(set, ref d, ref name, out t, buf, buf.Length, out req, 0)) n = Encoding.Unicode.GetString(buf, 0, Math.Max(0, req - 2));
        string kind = "bt";
        if (SetupDiGetDevicePropertyW(set, ref d, ref cls, out t, buf, buf.Length, out req, 0)) {
          string c = Encoding.Unicode.GetString(buf, 0, Math.Max(0, req - 2)).ToLowerInvariant();
          kind = c.Contains("mouse") ? "mouse" : c.Contains("keyboard") ? "keyboard" : (c.Contains("audio") || c.Contains("media")) ? "headset" : "bt";
        }
        if (n.Length > 0) outl.Add(n.Replace("\t", " ") + "\t" + kind + "\t" + lvl + "\t0");
      }
    } finally { SetupDiDestroyDeviceInfoList(set); }
    return outl;
  }
}
