
# Check for Go files in ./cmd/anilink
$goFiles = Get-ChildItem -Path ./cmd/anilink -Filter *.go -File
if (-not $goFiles) {
    Write-Host "Error: No Go files found in ./cmd/anilink. Exiting build script."
    exit 1
}

Write-Host "Building Go executables for Windows, Linux, and Termux..."

# Set output directory
$outputDir = "dist"
if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

# Build for Windows (amd64)
Write-Host "Building for Windows (amd64)..."
$env:GOOS = "windows"
$env:GOARCH = "amd64"

# Use Go's builtin linker flags for smallest size
$ldflags = '-s -w -buildid='
go build -ldflags $ldflags -trimpath -o "$outputDir/AniLINK_windows_amd64.exe" ./cmd/anilink

# Build for Linux (amd64)
Write-Host "Building for Linux (amd64)..."
$env:GOOS = "linux"
$env:GOARCH = "amd64"

go build -ldflags $ldflags -trimpath -o "$outputDir/AniLINK_linux_amd64" ./cmd/anilink
# Ensure the binary is executable
icacls "$outputDir/AniLINK_linux_amd64" /grant Everyone:RX | Out-Null

# Build for Termux (Android/arm64, uses Linux binary)
Write-Host "Building for Termux (Android/arm64)..."
$env:GOOS = "linux"
$env:GOARCH = "arm64"

go build -ldflags $ldflags -trimpath -o "$outputDir/AniLINK_termux_arm64" ./cmd/anilink
# Ensure the binary is executable
icacls "$outputDir/AniLINK_termux_arm64" /grant Everyone:RX | Out-Null

Write-Host "Build complete. Files are in the '$outputDir' directory."
