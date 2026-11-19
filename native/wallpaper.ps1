# Wyspa - animowana tapeta: jednorazowe wywołania kodu natywnego (WallpaperNative.cs).
#   -Action attach  -Hwnd <uchwyt> -X -Y -W -H   wkłada okno pod ikony pulpitu (piksele fizyczne)
#   -Action refresh                               przerysowuje pulpit po zamknięciu tapety
#   -Action reapply                               ustawia ponownie TĘ SAMĄ tapetę Windows (gdy samo przerysowanie nie wystarczy)
#   -Action describe                              opis układu pulpitu (diagnostyka)
param([string]$Action = 'describe', [long]$Hwnd = 0, [int]$X = 0, [int]$Y = 0, [int]$W = 0, [int]$H = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

$src = Join-Path $PSScriptRoot 'WallpaperNative.cs'
$code = [IO.File]::ReadAllText($src)
$sha = [BitConverter]::ToString((New-Object Security.Cryptography.SHA1Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes($code))).Replace('-', '').Substring(0, 12)
$cacheDir = Join-Path $env:APPDATA 'wyspa\native'
$dll = Join-Path $cacheDir "WallpaperNative-$sha.dll"
try {
  if (Test-Path $dll) { Add-Type -Path $dll }
  else {
    New-Item -ItemType Directory -Force $cacheDir | Out-Null
    Get-ChildItem $cacheDir -Filter 'WallpaperNative-*.dll' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Add-Type -TypeDefinition $code -OutputAssembly $dll -OutputType Library
    Add-Type -Path $dll
  }
  switch ($Action) {
    'attach'   { [WyspaWallpaper]::Attach($Hwnd, $X, $Y, $W, $H) }
    'refresh'  { [WyspaWallpaper]::Refresh() }
    'reapply'  { [WyspaWallpaper]::Reapply() }
    default    { [WyspaWallpaper]::Describe() }
  }
} catch { "error: $($_.Exception.Message)" }
