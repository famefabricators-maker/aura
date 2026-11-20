# Aura - pomocnik paska zadań: chowa pasek Windows, podaje listę okien, przełącza je. Koniec stdin = przywrócenie
# paska i wyjście. Na wypadek awarii (proces ginie razem z Aurą) jest jeszcze odłączony stróż (lib/taskbar.js).
# Parametr -Orig: zapamiętany stan paska Windows (-1 = odczytaj teraz). Polecenia (JSON, jedno na linię):
#   {"c":"act","h":123} {"c":"focus","h":123} {"c":"close","h":123} {"c":"keys","k":"start|quick|notif"} {"c":"pid","pid":1}
#   {"c":"quit"}
# Wysyła: {"t":"state","s":N} raz na starcie oraz {"t":"windows","list":"..."} przy każdej zmianie okien.
param([int]$Orig = -1, [string]$Marker = '')
$ErrorActionPreference = 'Stop'
# proces odłączony (bez konsoli): ustawienie kodowania konsoli może rzucić błąd — wtedy zostaje domyślne
try { [Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false } catch {}
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch {}

$code = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'TaskbarNative.cs'))
$sha = [BitConverter]::ToString((New-Object Security.Cryptography.SHA1Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes($code))).Replace('-', '').Substring(0, 12)
$cacheDir = if ($env:AURA_CACHE) { $env:AURA_CACHE } else { Join-Path $env:APPDATA 'Aura\native' }
$dll = Join-Path $cacheDir "TaskbarNative-$sha.dll"
if (Test-Path $dll) { Add-Type -Path $dll }
else {
  New-Item -ItemType Directory -Force $cacheDir | Out-Null
  Get-ChildItem $cacheDir -Filter 'TaskbarNative-*.dll' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Add-Type -TypeDefinition $code -OutputAssembly $dll -OutputType Library
  Add-Type -Path $dll
}
function Out-Line($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }

$state = if ($Orig -ge 0) { $Orig } else { [AuraTaskbar]::GetState() }
Out-Line @{ t = 'state'; s = $state }
[AuraTaskbar]::Hide()
# znacznik: „pasek Windows schowany, oryginalny stan = N” — stróż przywróci go, gdyby Aura padła
if ($Marker) { try { [IO.File]::WriteAllText($Marker, [string]$state) } catch {} }

$ownPid = 0; $last = ''; $tick = 0
$stdin = New-Object System.IO.StreamReader ([Console]::OpenStandardInput()), ([System.Text.Encoding]::UTF8)
$read = $stdin.ReadLineAsync()
try {
  while ($true) {
    while ($read.IsCompleted) {
      $line = $read.Result
      if ($null -eq $line) { return }          # Aura zamknięta albo się wysypała
      try {
        $m = $line | ConvertFrom-Json
        switch ($m.c) {
          'act' { [AuraTaskbar]::Activate([long]$m.h); $last = '' }
          'focus' { [AuraTaskbar]::Focus([long]$m.h); $last = '' }
          'close' { [AuraTaskbar]::Close([long]$m.h) }
          'keys' { [AuraTaskbar]::Keys([string]$m.k) }
          'pid' { $ownPid = [uint32]$m.pid }
          'quit' { return }
        }
      } catch {}
      $read = $stdin.ReadLineAsync()
    }
    if ($tick % 3 -eq 0) {
      $w = ''; try { $w = [AuraTaskbar]::Windows($ownPid) } catch {}
      if ($w -ne $last) { $last = $w; Out-Line @{ t = 'windows'; list = $w } }
      if ($tick % 30 -eq 0) { try { [AuraTaskbar]::Hide() } catch {} }  # np. po restarcie Eksploratora
    }
    [void]$read.Wait(150)
    $tick++
  }
} finally {
  [AuraTaskbar]::Restore($state)
  if ($Marker) { try { [IO.File]::Delete($Marker) } catch {} }
}
