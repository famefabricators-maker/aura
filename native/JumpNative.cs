// Aura - listy szybkiego dostępu programów (jump listy, jak pod prawym przyciskiem na pasku Windows): np. Steam —
// Sklep, Biblioteka, Znajomi…; przeglądarki — Nowe okno, Okno prywatne. Windows trzyma je w
// %APPDATA%\Microsoft\Windows\Recent\CustomDestinations\*.customDestinations-ms jako zapisane skróty (.lnk) jeden po drugim.
// Każdy skrót czytamy systemowym ShellLink (IPersistStream z pamięci) i bierzemy tytuł z jego właściwości.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

public static class AuraJumpList {
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")] class CShellLink { }
  [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder f, int cch, IntPtr pfd, uint flags);
    void GetIDList(out IntPtr p); void SetIDList(IntPtr p);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch); void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch); void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch); void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetHotkey(out short k); void SetHotkey(short k); void GetShowCmd(out int c); void SetShowCmd(int c);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch, out int i); void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string s, int i);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string s, uint r); void Resolve(IntPtr h, uint f); void SetPath([MarshalAs(UnmanagedType.LPWStr)] string s);
  }
  [ComImport, Guid("00000109-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPersistStream { void GetClassID(out Guid g); [PreserveSig] int IsDirty(); void Load(IStream s); void Save(IStream s, bool clear); void GetSizeMax(out long n); }
  [StructLayout(LayoutKind.Sequential, Pack = 4)] struct PROPERTYKEY { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Sequential)] struct PROPVARIANT { public ushort vt; public ushort r1, r2, r3; public IntPtr p; public IntPtr p2; }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore { void GetCount(out uint c); void GetAt(uint i, out PROPERTYKEY k); void GetValue(ref PROPERTYKEY k, out PROPVARIANT v); void SetValue(ref PROPERTYKEY k, ref PROPVARIANT v); void Commit(); }
  [DllImport("shlwapi.dll")] static extern IStream SHCreateMemStream(byte[] p, uint cb);
  [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)] static extern int SHLoadIndirectString(string src, StringBuilder outBuf, int cch, IntPtr r);
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT v);

  static readonly byte[] LNK = { 0x4C, 0, 0, 0, 0x01, 0x14, 0x02, 0, 0, 0, 0, 0, 0xC0, 0, 0, 0, 0, 0, 0, 0x46 };
  static string Title(IShellLinkW l) {
    var ps = l as IPropertyStore; if (ps == null) return "";
    var k = new PROPERTYKEY { fmtid = new Guid("F29F85E0-4FF9-1068-AB91-08002B27B3D9"), pid = 2 }; // PKEY_Title
    PROPVARIANT v; ps.GetValue(ref k, out v);
    string t = v.vt == 31 && v.p != IntPtr.Zero ? Marshal.PtrToStringUni(v.p) : "";
    PropVariantClear(ref v);
    if (t.StartsWith("@")) { var sb = new StringBuilder(512); if (SHLoadIndirectString(t, sb, 512, IntPtr.Zero) == 0) t = sb.ToString(); }
    return t;
  }
  // zadania dla programu (np. "steam.exe"): linie „tytuł \t program \t parametry”
  public static string Tasks(string exe) {
    exe = (exe ?? "").ToLowerInvariant(); var outl = new StringBuilder(); var seen = new HashSet<string>();
    string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Microsoft\Windows\Recent\CustomDestinations");
    string[] files; try { files = Directory.GetFiles(dir, "*.customDestinations-ms"); } catch { return ""; }
    Array.Sort(files, (a, b) => File.GetLastWriteTimeUtc(b).CompareTo(File.GetLastWriteTimeUtc(a))); // najnowsza lista programu wygrywa
    foreach (var f in files) {
      byte[] b; try { b = File.ReadAllBytes(f); } catch { continue; }
      var tasks = new List<string>(); bool mine = false;
      for (int i = 0; i + LNK.Length < b.Length; i++) {
        bool hit = true; for (int j = 0; j < LNK.Length; j++) if (b[i + j] != LNK[j]) { hit = false; break; }
        if (!hit) continue;
        try {
          var part = new byte[b.Length - i]; Array.Copy(b, i, part, 0, part.Length);
          var link = (IShellLinkW)new CShellLink();
          ((IPersistStream)link).Load(SHCreateMemStream(part, (uint)part.Length));
          var p = new StringBuilder(1024); link.GetPath(p, 1024, IntPtr.Zero, 0x4 /* SLGP_RAWPATH */);
          var a = new StringBuilder(2048); link.GetArguments(a, 2048);
          string path = Environment.ExpandEnvironmentVariables(p.ToString()), args = a.ToString(), title = Title(link);
          if (Path.GetFileName(path).ToLowerInvariant() == exe || args.ToLowerInvariant().Contains(exe)) mine = true;
          if (title.Length > 0 && path.Length > 0) tasks.Add(title.Replace("\t", " ") + "\t" + path + "\t" + args.Replace("\t", " "));
          Marshal.ReleaseComObject(link);
        } catch { }
        i += LNK.Length;
      }
      if (!mine) continue;
      foreach (var t in tasks) if (seen.Add(t.Split('\t')[0])) outl.Append(t).Append('\n');
      break; // jedna lista na program
    }
    return outl.ToString();
  }
  public static void Run(string path, string args) {
    try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path, args ?? "") { UseShellExecute = true }); } catch { }
  }
}
