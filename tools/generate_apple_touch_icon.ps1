param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\web\icons")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

function New-RoundedRectanglePath {
    param(
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $Radius * 2
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

$size = 180
$bitmap = [System.Drawing.Bitmap]::new($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::FromArgb(47, 109, 246))

    # Proven iOS-friendly motif: one dominant flat background plus one compact,
    # high-contrast foreground shape. The matrix artwork remains the in-app logo.
    $framePath = New-RoundedRectanglePath -X 54 -Y 54 -Width 72 -Height 72 -Radius 20
    $framePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 8.5)
    try {
        $graphics.DrawPath($framePen, $framePath)
    } finally {
        $framePen.Dispose()
        $framePath.Dispose()
    }

    $dotBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    try {
        $graphics.FillEllipse($dotBrush, 105, 61.5, 19, 19)
    } finally {
        $dotBrush.Dispose()
    }

    foreach ($name in @("icon-180.png", "apple-touch-icon.png", "apple-touch-icon-v2.png")) {
        $bitmap.Save((Join-Path $OutputDirectory $name), [System.Drawing.Imaging.ImageFormat]::Png)
    }
} finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}
