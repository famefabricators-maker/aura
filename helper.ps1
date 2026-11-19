# Aura - pomocnik systemowy.
# Wypisuje linie JSON (zdarzenia) na stdout, przyjmuje komendy JSON na stdin.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

# --- kod natywny: kompilacja raz, potem z pamieci podrecznej ---
$src = Join-Path $PSScriptRoot 'native\WyspaNative.cs'
$code = [IO.File]::ReadAllText($src)
$sha = [BitConverter]::ToString((New-Object Security.Cryptography.SHA1Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes($code))).Replace('-', '').Substring(0, 12)
$cacheDir = if ($env:AURA_CACHE) { $env:AURA_CACHE } else { Join-Path $env:APPDATA 'Aura\native' }
$dll = Join-Path $cacheDir "WyspaNative-$sha.dll"
if (Test-Path $dll) { Add-Type -Path $dll }
else {
  New-Item -ItemType Directory -Force $cacheDir | Out-Null
  Get-ChildItem $cacheDir -Filter 'WyspaNative-*.dll' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Add-Type -TypeDefinition $code -OutputAssembly $dll -OutputType Library
  Add-Type -Path $dll
}
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[WyspaWin]::Init()

function Out-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  if ($task.Wait(4000)) { return $task.Result }
  return $null
}

# --- media (Windows Media Session) ---
$mgr = $null
try {
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
  $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
  $mgr = Await ($mgrType::RequestAsync()) $mgrType
} catch { Out-Line @{ t = 'log'; msg = "media: $($_.Exception.Message)" } }

# Okładka: PowerShell nie widzi metod strumienia WinRT, więc rzutujemy go przez refleksję na strumień .NET.
$asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))
function Get-Thumb($ref) {
  try {
    $stream = Await ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if (-not $stream) { return $null }
    $net = $asStreamForRead.Invoke($null, @($stream))
    $ms = New-Object System.IO.MemoryStream
    $net.CopyTo($ms); $net.Dispose()
    $bytes = $ms.ToArray()
    if ($bytes.Length -lt 16) { return $null }
    $type = if ($bytes[0] -eq 0x89) { 'image/png' } elseif ($bytes[0] -eq 0xFF) { 'image/jpeg' } elseif ($bytes[0] -eq 0x47) { 'image/gif' } else { 'image/bmp' }
    return "data:$type;base64," + [Convert]::ToBase64String($bytes)
  } catch { return $null }
}

# --- jasnosc ---
$wmiBright = $false
try { $null = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1; $wmiBright = $true } catch {}
function Get-Bright {
  if ($wmiBright) { try { return @{ v = [int](Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1).CurrentBrightness; src = 'wmi' } } catch {} }
  $d = [WyspaWin]::DdcGet()
  if ($d -ge 0) { return @{ v = $d; src = 'ddc' } }
  return @{ v = -1; src = $null }
}
function Set-Bright([int]$v) {
  $v = [Math]::Max(0, [Math]::Min(100, $v))
  if ($wmiBright) { try { Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = [byte]$v } | Out-Null; return } catch {} }
  [void][WyspaWin]::DdcSet($v)
}

# --- Wi-Fi / Bluetooth ---
$radioType = $null
try {
  $null = [Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime]
  $radioType = [Windows.Devices.Radios.Radio]
} catch {}
function Get-Radios {
  if (-not $radioType) { return @() }
  try {
    $list = Await ($radioType::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
    return @($list | ForEach-Object { @{ kind = $_.Kind.ToString(); name = $_.Name; on = ($_.State.ToString() -eq 'On') } })
  } catch { return @() }
}
function Set-Radio([string]$kind, [bool]$on) {
  if (-not $radioType) { return }
  try {
    $null = Await ($radioType::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
    $list = Await ($radioType::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
    foreach ($r in $list) {
      if ($r.Kind.ToString() -eq $kind) {
        $state = if ($on) { [Windows.Devices.Radios.RadioState]::On } else { [Windows.Devices.Radios.RadioState]::Off }
        $null = Await ($r.SetStateAsync($state)) ([Windows.Devices.Radios.RadioAccessStatus])
      }
    }
  } catch {}
}

# --- siec ---
$netPrev = $null; $netTime = $null
function Get-Net {
  $rx = 0; $tx = 0
  foreach ($n in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($n.OperationalStatus -ne 'Up' -or $n.NetworkInterfaceType -eq 'Loopback') { continue }
    try { $s = $n.GetIPStatistics(); $rx += $s.BytesReceived; $tx += $s.BytesSent } catch {}
  }
  $now = [DateTime]::UtcNow
  $res = @{ rx = 0; tx = 0 }
  if ($script:netPrev) {
    $dt = ($now - $script:netTime).TotalSeconds
    if ($dt -gt 0) { $res.rx = [long](($rx - $script:netPrev[0]) / $dt); $res.tx = [long](($tx - $script:netPrev[1]) / $dt) }
  }
  $script:netPrev = @($rx, $tx); $script:netTime = $now
  return $res
}

function Handle($line) {
  $m = $line | ConvertFrom-Json
  $s = if ($mgr) { $mgr.GetCurrentSession() } else { $null }
  switch ($m.c) {
    'media' {
      if ($s) {
        switch ($m.a) {
          'toggle' { $null = $s.TryTogglePlayPauseAsync() }
          'next' { $null = $s.TrySkipNextAsync() }
          'prev' { $null = $s.TrySkipPreviousAsync() }
        }
      }
      $script:force = $true
    }
    'seek' { if ($s) { $null = $s.TryChangePlaybackPositionAsync([long]([double]$m.s * 10000000)) }; $script:force = $true }
    'vol' { [WyspaAudio]::SetLevel(0, [float]$m.v) }
    'mute' { [WyspaAudio]::SetMute(0, [bool]$m.on) }
    'micmute' { [WyspaAudio]::MuteAllMics([bool]$m.on) }
    'pick' { Out-Line @{ t = 'color'; hex = [WyspaWin]::PickColor() } }
    'bright' { Set-Bright ([int]$m.v); Out-Line (@{ t = 'bright' } + (Get-Bright)) }
    'brightget' { Out-Line (@{ t = 'bright' } + (Get-Bright)) }
    'stats' { Out-Line (@{ t = 'net' } + (Get-Net)) }
    'ownpid' { $script:ownPid = [int]$m.pid }
    'power' { if ($m.g) { [void][WyspaWin]::SetPowerMode([string]$m.g) }; Out-Line @{ t = 'power'; g = [WyspaWin]::PowerMode() } }
    'radios' { Out-Line @{ t = 'radios'; list = @(Get-Radios) } }
    'radio' { Set-Radio ([string]$m.kind) ([bool]$m.on); Out-Line @{ t = 'radios'; list = @(Get-Radios) } }
  }
}

$stdin = New-Object System.IO.StreamReader ([Console]::OpenStandardInput()), ([System.Text.Encoding]::UTF8)
$readTask = $stdin.ReadLineAsync()
$lastMedia = ''; $lastKey = ''; $thumbTries = 0
$lastFs = $null; $lastSeq = [WyspaWin]::GetClipboardSequenceNumber()
$lastVol = ''; $lastMic = ''; $lastKeys = -1; $lastUse = ''; $lastBright = $null
$tick = 0; $script:force = $true; $script:ownPid = 0; $lastCov = -1

while ($true) {
  while ($readTask.IsCompleted) {
    $cmd = $readTask.Result
    if ($null -eq $cmd) { exit 0 }
    try { if ($cmd.Trim()) { Handle $cmd } } catch { Out-Line @{ t = 'log'; msg = "cmd: $($_.Exception.Message)" } }
    $readTask = $stdin.ReadLineAsync()
  }

  # schowek
  $seq = [WyspaWin]::GetClipboardSequenceNumber()
  if ($seq -ne $lastSeq) { $lastSeq = $seq; Out-Line @{ t = 'clip'; private = [WyspaWin]::ClipboardIsPrivate() } }

  # pelny ekran
  $fs = $false; try { $fs = [WyspaWin]::IsFullscreen() } catch {}
  if ($fs -ne $lastFs) { $lastFs = $fs; Out-Line @{ t = 'fs'; on = $fs } }

  # okno zasłania górę ekranu -> wyspa zwija się do cienkiej linii
  $cv = 0; try { $cv = [WyspaWin]::TopCovered($script:ownPid) } catch {}
  if ($cv -ge 0 -and $cv -ne $lastCov) { $lastCov = $cv; Out-Line @{ t = 'covered'; on = ($cv -eq 1) } }

  # glosnosc i mikrofon
  $v = [WyspaAudio]::State(0)
  if ($v -ne $lastVol) {
    $lastVol = $v
    if ($v) { $p = $v.Split('|'); Out-Line @{ t = 'vol'; level = [double]::Parse($p[0], [Globalization.CultureInfo]::InvariantCulture); mute = ($p[1] -eq '1'); name = $p[2]; id = $p[3] } }
  }
  if ($tick % 2 -eq 0) {
    $mv = [WyspaAudio]::State(1)
    if ($mv -ne $lastMic) {
      $lastMic = $mv
      if ($mv) { $p = $mv.Split('|'); Out-Line @{ t = 'mic'; level = [double]::Parse($p[0], [Globalization.CultureInfo]::InvariantCulture); mute = ($p[1] -eq '1'); name = $p[2] } }
    }
  }

  # Caps Lock / Num Lock
  $k = [WyspaWin]::LockKeys()
  if ($k -ne $lastKeys) { if ($lastKeys -ge 0) { Out-Line @{ t = 'keys'; caps = [bool]($k -band 1); num = [bool]($k -band 2) } }; $lastKeys = $k }

  # mikrofon / kamera w uzyciu
  if ($tick % 10 -eq 0) {
    $mic = [WyspaWin]::InUse('microphone'); $cam = [WyspaWin]::InUse('webcam')
    $u = "$mic/$cam"
    if ($u -ne $lastUse) {
      $lastUse = $u
      Out-Line @{ t = 'inuse'; mic = @($mic.Split('|') | Where-Object { $_ }); cam = @($cam.Split('|') | Where-Object { $_ }) }
    }
  }

  # jasnosc laptopa (zmiana klawiszami)
  if ($wmiBright -and $tick % 8 -eq 0) {
    $b = Get-Bright
    if ($b.v -ne $lastBright) { $first = $null -eq $lastBright; $lastBright = $b.v; Out-Line (@{ t = 'bright'; initial = $first } + $b) }
  }

  # muzyka
  if ($mgr -and ($script:force -or ($tick % 5 -eq 0))) {
    $script:force = $false
    try {
      $s = $mgr.GetCurrentSession()
      if ($s) {
        $pr = Await ($s.TryGetMediaPropertiesAsync()) $propsType
        $info = $s.GetPlaybackInfo()
        $tl = $s.GetTimelineProperties()
        $key = "$($s.SourceAppUserModelId)|$($pr.Title)|$($pr.Artist)"
        if ($key -ne $lastKey) { $lastKey = $key; $thumbTries = 0; Out-Line @{ t = 'thumb'; data = $null } }
        if ($thumbTries -lt 4 -and $pr -and $pr.Thumbnail) {
          $thumbTries++
          $th = Get-Thumb $pr.Thumbnail
          if ($th) { $thumbTries = 99; Out-Line @{ t = 'thumb'; data = $th } }
        }
        $o = [ordered]@{
          t = 'media'; has = $true
          title = [string]$pr.Title; artist = [string]$pr.Artist; album = [string]$pr.AlbumTitle
          app = [string]$s.SourceAppUserModelId
          playing = ($info.PlaybackStatus.ToString() -eq 'Playing')
          pos = [math]::Round($tl.Position.TotalSeconds, 1)
          end = [math]::Round($tl.EndTime.TotalSeconds, 1)
          upd = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
          canNext = [bool]$info.Controls.IsNextEnabled
          canPrev = [bool]$info.Controls.IsPreviousEnabled
          canSeek = [bool]$info.Controls.IsPlaybackPositionEnabled
        }
      } else { $o = [ordered]@{ t = 'media'; has = $false }; $lastKey = '' }
      $json = $o | ConvertTo-Json -Compress
      if ($json -ne $lastMedia) { $lastMedia = $json; [Console]::Out.WriteLine($json); [Console]::Out.Flush() }
    } catch {}
  }

  $tick++
  # czekaj do 200 ms, ale obudź się od razu, gdy przyjdzie komenda (płynna głośność i przewijanie)
  [void]$readTask.Wait(200)
}
