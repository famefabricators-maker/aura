// Aura - stróż paska Windows. Uruchamiany przez wscript.exe (działa bez konsoli, przeżywa awarię Aury).
// Argumenty: <pid Aury> <plik-znacznik> <TaskbarNative.cs>. Czeka, aż proces Aury zniknie; jeśli znacznik
// „pasek Windows schowany” nadal istnieje (Aura nie zdążyła go przywrócić), przywraca pasek i usuwa znacznik.
var a = WScript.Arguments;
var pid = a(0), marker = a(1), cs = a(2);
var wmi = GetObject("winmgmts:\\\\.\\root\\cimv2");
while (wmi.ExecQuery("select ProcessId from Win32_Process where ProcessId=" + pid).Count > 0) WScript.Sleep(1500);
WScript.Sleep(1000);
var fso = new ActiveXObject("Scripting.FileSystemObject");
if (fso.FileExists(marker)) {
  var q = function (s) { return "'" + String(s).replace(/'/g, "''") + "'"; };
  var ps = "$s=[int](Get-Content -LiteralPath " + q(marker) + "); $c=[IO.File]::ReadAllText(" + q(cs) + "); Add-Type -TypeDefinition $c; [AuraTaskbar]::Restore($s); Remove-Item -LiteralPath " + q(marker);
  new ActiveXObject("WScript.Shell").Run('powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "' + ps + '"', 0, true);
}
