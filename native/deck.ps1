# Wyspa - PC Deck: proces wykonujący ruchy myszy i klawisze z telefonu.
# Czyta ze stdin krótkie polecenia (jedno na linię), np.:
#   m <dx> <dy>          ruch myszy (względny)
#   c <l|r|m>            klik
#   b <l|r|m> <1|0>      wciśnij / puść przycisk (przeciąganie)
#   s <dy> <dx>          przewijanie (120 = jeden ząbek)
#   k <vk>               naciśnij klawisz (kod VK dziesiętnie)
#   x <vk,vk,...>        skrót (np. 18,9 = Alt+Tab)
#   t <base64 UTF-8>     wpisz tekst
#   q                    zakończ
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

$src = Join-Path $PSScriptRoot 'DeckInput.cs'
$code = [IO.File]::ReadAllText($src)
$sha = [BitConverter]::ToString((New-Object Security.Cryptography.SHA1Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes($code))).Replace('-', '').Substring(0, 12)
$cacheDir = Join-Path $env:APPDATA 'wyspa\native'
$dll = Join-Path $cacheDir "DeckInput-$sha.dll"
if (Test-Path $dll) { Add-Type -Path $dll }
else {
  New-Item -ItemType Directory -Force $cacheDir | Out-Null
  Get-ChildItem $cacheDir -Filter 'DeckInput-*.dll' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Add-Type -TypeDefinition $code -OutputAssembly $dll -OutputType Library
  Add-Type -Path $dll
}
[Console]::Out.WriteLine('ready'); [Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $p = $line.Split(' ')
  try {
    switch ($p[0]) {
      'm' { [WyspaDeckInput]::Move([int]$p[1], [int]$p[2]) }
      'c' { [WyspaDeckInput]::Click($p[1]) }
      'b' { [WyspaDeckInput]::Button($p[1], $p[2] -eq '1') }
      's' { [WyspaDeckInput]::Scroll([int]$p[1], [int]$p[2]) }
      'k' { [WyspaDeckInput]::Tap([uint16]$p[1]) }
      'x' { [WyspaDeckInput]::Combo([uint16[]]($p[1].Split(','))) }
      't' { [WyspaDeckInput]::Text([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[1]))) }
      'q' { exit 0 }
    }
  } catch { [Console]::Out.WriteLine("error: $($_.Exception.Message)"); [Console]::Out.Flush() }
}
