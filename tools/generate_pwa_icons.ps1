param(
    [string]$SharpModule = "sharp"
)

$ErrorActionPreference = "Stop"
# All sizes share the SVG source used in the header and browser favicon.
& node (Join-Path $PSScriptRoot "generate_pwa_icons.mjs") $SharpModule
if ($LASTEXITCODE -ne 0) { throw "Icon rendering failed." }
