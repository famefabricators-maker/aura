// Wyspa - PC Deck: wstrzykiwanie myszy i klawiatury (SendInput) na polecenie zatwierdzonego telefonu.
// Uwaga: Windows (UIPI) nie pozwala sterować oknami uruchomionymi jako administrator — to zamierzone.
using System;
using System.Runtime.InteropServices;

public static class WyspaDeckInput {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public int mouseData; public uint dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct HARDWAREINPUT { public uint uMsg; public ushort wParamL, wParamH; }
  [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public HARDWAREINPUT hi; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);

  const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
  const uint MOVE = 0x1, LDOWN = 0x2, LUP = 0x4, RDOWN = 0x8, RUP = 0x10, MDOWN = 0x20, MUP = 0x40, WHEEL = 0x800, HWHEEL = 0x1000;
  const uint KEY_EXT = 0x1, KEY_UP = 0x2, KEY_UNICODE = 0x4;

  static uint Send(params INPUT[] a) { return SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT))); }
  static INPUT Mouse(uint flags, int dx, int dy, int data) {
    INPUT i = new INPUT { type = INPUT_MOUSE }; i.u.mi = new MOUSEINPUT { dx = dx, dy = dy, mouseData = data, dwFlags = flags }; return i;
  }
  static INPUT Kb(ushort vk, ushort scan, uint flags) {
    INPUT i = new INPUT { type = INPUT_KEYBOARD }; i.u.ki = new KEYBDINPUT { wVk = vk, wScan = scan, dwFlags = flags }; return i;
  }
  // klawisze rozszerzone (strzałki, Home/End, PgUp/PgDn, Insert/Delete, prawy Ctrl/Alt, Win, Apps)
  static bool Extended(ushort vk) {
    return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0x5B || vk == 0x5C || vk == 0x5D || vk == 0xA3 || vk == 0xA5;
  }

  public static void Move(int dx, int dy) { if (dx != 0 || dy != 0) Send(Mouse(MOVE, dx, dy, 0)); }
  public static void Button(string b, bool down) {
    uint f = b == "r" ? (down ? RDOWN : RUP) : b == "m" ? (down ? MDOWN : MUP) : (down ? LDOWN : LUP);
    Send(Mouse(f, 0, 0, 0));
  }
  public static void Click(string b) { Button(b, true); Button(b, false); }
  // dy > 0 = przewiń w górę (jak kółko od siebie); 120 = jeden „ząbek”, mniejsze wartości = płynnie
  public static void Scroll(int dy, int dx) {
    if (dy != 0) Send(Mouse(WHEEL, 0, 0, dy));
    if (dx != 0) Send(Mouse(HWHEEL, 0, 0, dx));
  }
  public static void Key(ushort vk, bool down) { Send(Kb(vk, 0, (Extended(vk) ? KEY_EXT : 0) | (down ? 0 : KEY_UP))); }
  public static void Tap(ushort vk) { Key(vk, true); Key(vk, false); }
  // np. Combo(0x12, 0x09) = Alt+Tab: wciśnij po kolei, puść w odwrotnej kolejności
  public static void Combo(ushort[] vks) {
    for (int i = 0; i < vks.Length; i++) Key(vks[i], true);
    for (int i = vks.Length - 1; i >= 0; i--) Key(vks[i], false);
  }
  [DllImport("user32.dll")] static extern bool LockWorkStation();
  [DllImport("powrprof.dll")] static extern bool SetSuspendState(bool hibernate, bool force, bool disableWakeEvent);
  // Win+L nie da się wstrzyknąć przez SendInput (chronione przez Windows), więc blokada idzie przez LockWorkStation
  public static bool Lock() { return LockWorkStation(); }
  // uśpienie (nie hibernacja); aplikacje mogą je wstrzymać, bo force = false
  public static bool Sleep() { return SetSuspendState(false, false, false); }

  // dowolny tekst (także polskie znaki) jako znaki Unicode; \n = Enter
  public static void Text(string s) {
    foreach (char c in s ?? "") {
      if (c == '\r') continue;
      if (c == '\n') { Tap(0x0D); continue; }
      Send(Kb(0, c, KEY_UNICODE), Kb(0, c, KEY_UNICODE | KEY_UP));
    }
  }
}
