# Aura - pomocnik paska zadań: chowa pasek Windows, podaje listę okien, przełącza je. Koniec stdin = przywrócenie
# paska i wyjście. Na wypadek awarii (proces ginie razem z Aurą) jest jeszcze odłączony stróż (lib/taskbar.js).
# Parametr -Orig: zapamiętany stan paska Windows (-1 = odczytaj teraz). Polecenia (JSON, jedno na linię):
#   {"c":"act","h":123} {"c":"focus","h":123} {"c":"close","h":123} {"c":"keys","k":"start|quick|notif"} {"c":"pid","pid":1}
#   {"c":"ping"} -> {"t":"pong"}  {"c":"quit"}
# Wysyła: {"t":"state","s":N} raz na starcie oraz {"t":"windows","list":"..."} przy każdej zmianie okien.
param([int]$Orig = -1, [string]$Marker = '', [int]$AuraPid = 0)
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
# ikony okien (System.Drawing) — osobno, bo TaskbarNative.cs kompiluje też stróż bez dodatkowych bibliotek; błąd = bez ikon okien
$iconOk = $false
try {
  $icode = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'IconNative.cs'))
  $isha = [BitConverter]::ToString((New-Object Security.Cryptography.SHA1Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes($icode))).Replace('-', '').Substring(0, 12)
  $idll = Join-Path $cacheDir "IconNative-$isha.dll"
  if (-not (Test-Path $idll)) {
    New-Item -ItemType Directory -Force $cacheDir | Out-Null
    Get-ChildItem $cacheDir -Filter 'IconNative-*.dll' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Add-Type -TypeDefinition $icode -ReferencedAssemblies System.Drawing -OutputAssembly $idll -OutputType Library
  }
  Add-Type -Path $idll; $iconOk = $true
} catch {}
# listy szybkiego dostępu programów (jump listy: Steam — Sklep, Biblioteka…) — też osobno, błąd = menu bez nich
$jumpOk = $false
try {
  $jcode = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'JumpNative.cs'))
  $jsha = [BitConverter]::ToString((New-Object Security.Cryptography.SHA1Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes($jcode))).Replace('-', '').Substring(0, 12)
  $jdll = Join-Path $cacheDir "JumpNative-$jsha.dll"
  if (-not (Test-Path $jdll)) {
    New-Item -ItemType Directory -Force $cacheDir | Out-Null
    Get-ChildItem $cacheDir -Filter 'JumpNative-*.dll' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Add-Type -TypeDefinition $jcode -OutputAssembly $jdll -OutputType Library
  }
  Add-Type -Path $jdll; $jumpOk = $true
} catch {}
function Out-Line($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }

[AuraTaskbar]::DpiAware()

# Ikony zasobnika: Windows 11 trzyma je w rejestrze (ścieżka programu, podpis, obrazek PNG, czy widoczna przy zegarze).
# Pokazujemy te, których program teraz działa.
$knownFolders = @{ '{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}' = ${env:ProgramFiles(x86)}; '{6D809377-6AF0-444B-8957-A3773F02200E}' = $env:ProgramFiles;
  '{F38BF404-1D43-42F2-9305-67DE0B28FC23}' = $env:windir; '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}' = "$env:windir\System32"; '{D65231B0-B2F1-4857-A4CE-A8E7C6EA7D27}' = "$env:windir\SysWOW64" }
$skipTray = @('explorer.exe', 'electron.exe', 'aura.exe', 'monotificationux.exe')
function Get-Tray {
  $run = @{}; foreach ($p in [Diagnostics.Process]::GetProcesses()) { $run[$p.ProcessName.ToLower() + '.exe'] = 1 }
  $out = @{}
  foreach ($k in (Get-ChildItem 'HKCU:\Control Panel\NotifyIconSettings' -ErrorAction SilentlyContinue)) {
    $p = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue
    $exe = [string]$p.ExecutablePath; if (-not $exe) { continue }
    $name = ($exe -split '\\')[-1].ToLower()
    if (-not $run.ContainsKey($name) -or $skipTray -contains $name) { continue }
    $img = [byte[]]$p.IconSnapshot; if (-not $img -or $img.Length -lt 50) { continue }
    $prom = ($p.IsPromoted -eq 1)
    $prev = $out[$name]; if ($prev -and ($prev.promoted -or -not $prom)) { continue }
    foreach ($g in $knownFolders.Keys) { if ($exe.StartsWith($g, 'OrdinalIgnoreCase')) { $exe = $knownFolders[$g] + $exe.Substring($g.Length) } }
    $tip = [string]$p.InitialTooltip
    $out[$name] = [ordered]@{ key = $name; exe = $exe; name = $(if ($tip) { $tip } else { $name -replace '\.exe$', '' }); promoted = $prom; icon = [Convert]::ToBase64String($img) }
  }
  return ,@($out.Values)
}

$state = if ($Orig -ge 0) { $Orig } else { [AuraTaskbar]::GetState() }
Out-Line @{ t = 'state'; s = $state }
[AuraTaskbar]::Hide()
# znacznik: „pasek Windows schowany, oryginalny stan = N” — stróż przywróci go, gdyby Aura padła
# „stan pid”: stróż innej kopii Aury nie ruszy cudzego znacznika (wcześniej kasował go przy szybkim restarcie)
if ($Marker) { try { [IO.File]::WriteAllText($Marker, "$state $AuraPid") } catch {} }

$ownPid = 0; $last = ''; $tick = 0; $lastTray = ''
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
          'act' { $sw = [Diagnostics.Stopwatch]::StartNew(); [AuraTaskbar]::Activate([long]$m.h); $last = ''; Out-Line @{ t = 'acted'; ms = $sw.ElapsedMilliseconds } }
          'jump' { $jl = ''; if ($jumpOk) { try { $jl = [AuraJumpList]::Tasks([string]$m.exe) } catch {} }; Out-Line @{ t = 'jump'; key = [string]$m.exe; list = $jl } }
          'run' { if ($jumpOk) { [AuraJumpList]::Run([string]$m.p, [string]$m.a) } }
          'wicon' { $png = ''; if ($iconOk) { try { $png = [AuraWinIcon]::Png([long]$m.h) } catch {} }; Out-Line @{ t = 'wicon'; key = [string]$m.key; png = $png } }
          'focus' { $sw = [Diagnostics.Stopwatch]::StartNew(); [AuraTaskbar]::Focus([long]$m.h); $last = ''; Out-Line @{ t = 'acted'; ms = $sw.ElapsedMilliseconds } }
          'close' { [AuraTaskbar]::Close([long]$m.h) }
          'keys' { [AuraTaskbar]::Keys([string]$m.k) }
          'pid' { $ownPid = [uint32]$m.pid }
          'reserve' { [AuraTaskbar]::Reserve([long]$m.h, [int]$m.px) }
          'unreserve' { [AuraTaskbar]::Unreserve() }
          'ping' { [Console]::Out.WriteLine('{"t":"pong"}'); [Console]::Out.Flush() }
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
    if ($tick % 20 -eq 0) {  # zasobnik co ~3 s
      try {
        $tj = ConvertTo-Json -InputObject (Get-Tray) -Compress -Depth 4
        if (-not $tj -or $tj -eq 'null') { $tj = '[]' } elseif (-not $tj.StartsWith('[')) { $tj = "[$tj]" }
        if ($tj -ne $lastTray) { $lastTray = $tj; [Console]::Out.WriteLine('{"t":"tray","list":' + $tj + '}'); [Console]::Out.Flush() }
      } catch {}
    }
    [void]$read.Wait(150)
    if ($tick % 400 -eq 200) { [AuraTaskbar]::Trim() }  # ok. co minutę: oddaj systemowi nieużywaną pamięć
    $tick++
  }
} finally {
  try { [AuraTaskbar]::Unreserve() } catch {}
  [AuraTaskbar]::Restore($state)
  # kasujemy tylko własny znacznik (nowsza kopia Aury mogła już zapisać swój)
  if ($Marker) { try { $mk = ([IO.File]::ReadAllText($Marker)).Trim().Split(' '); if ($mk.Count -lt 2 -or [int]$mk[1] -eq $AuraPid) { [IO.File]::Delete($Marker) } } catch {} }
}
