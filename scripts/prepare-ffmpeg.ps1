$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$BinaryPath = Join-Path $ProjectRoot 'bin\ffmpeg.exe'
New-Item -ItemType Directory -Force (Split-Path $BinaryPath) | Out-Null
Invoke-WebRequest -Uri 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64' -OutFile $BinaryPath
$ExpectedHash = '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00'
if ((Get-FileHash $BinaryPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedHash) {
 Remove-Item $BinaryPath -Force
 throw 'FFmpeg checksum mismatch. Build stopped.'
}
Write-Host 'FFmpeg is ready.'
