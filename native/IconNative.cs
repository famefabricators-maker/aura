// Aura - ikona okna dla paska zadań (tak jak pasek Windows): aplikacje, których plik .exe nie ma ikony
// (np. OpenBot i inne aplikacje Electron ustawiające ikonę dopiero oknu), mają ją tylko na oknie.
// Osobny plik, bo potrzebuje System.Drawing — TaskbarNative.cs kompiluje też stróż paska bez dodatkowych bibliotek.
using System;
using System.Runtime.InteropServices;

public static class AuraWinIcon {
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll", EntryPoint = "GetClassLongPtrW")] static extern IntPtr GetClassLongPtr64(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint = "GetClassLongW")] static extern IntPtr GetClassLong32(IntPtr h, int i);
  static IntPtr ClassIcon(IntPtr h, int i) { return IntPtr.Size == 8 ? GetClassLongPtr64(h, i) : GetClassLong32(h, i); }
  // PNG w base64 albo "" — najpierw duża ikona okna (WM_GETICON), potem ikona klasy okna
  public static string Png(long hv) {
    IntPtr h = new IntPtr(hv), ic = IntPtr.Zero, r;
    try {
      foreach (int kind in new[] { 1 /* ICON_BIG */, 2 /* ICON_SMALL2 */, 0 /* ICON_SMALL */ }) {
        if (SendMessageTimeout(h, 0x007F /* WM_GETICON */, (IntPtr)kind, IntPtr.Zero, 0x0002 /* SMTO_ABORTIFHUNG */, 300, out r) != IntPtr.Zero && r != IntPtr.Zero) { ic = r; break; }
      }
      if (ic == IntPtr.Zero) ic = ClassIcon(h, -14 /* GCLP_HICON */);
      if (ic == IntPtr.Zero) ic = ClassIcon(h, -34 /* GCLP_HICONSM */);
      if (ic == IntPtr.Zero) return "";
      using (var icon = System.Drawing.Icon.FromHandle(ic))
      using (var src = icon.ToBitmap())
      using (var ms = new System.IO.MemoryStream()) {
        int side = Math.Min(96, Math.Max(src.Width, src.Height)); // ikony bywają 1600 px — na pasek wystarczy 96
        using (var bmp = new System.Drawing.Bitmap(side, side))
        using (var g = System.Drawing.Graphics.FromImage(bmp)) {
          g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
          g.DrawImage(src, 0, 0, side, side);
          bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
        }
        return Convert.ToBase64String(ms.ToArray());
      }
    } catch { return ""; }
  }
}
