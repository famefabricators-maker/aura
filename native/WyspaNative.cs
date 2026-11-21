// Wyspa - natywne funkcje Windows dla pomocnika PowerShell.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

public static class WyspaWin {
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
