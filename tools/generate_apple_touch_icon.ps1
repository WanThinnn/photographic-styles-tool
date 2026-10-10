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

function Write-Icon {
    param(
        [int]$Size,
        [string[]]$Names,
        [switch]$RoundedCanvas
    )

    $bitmap = [System.Drawing.Bitmap]::new(
        $Size,
        $Size,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        $blue = [System.Drawing.Color]::FromArgb(47, 109, 246)
        if ($RoundedCanvas) {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $outer = New-RoundedRectanglePath -X 1 -Y 1 -Width ($Size - 2) -Height ($Size - 2) -Radius ($Size * 0.22)
            $blueBrush = [System.Drawing.SolidBrush]::new($blue)
            try {
                $graphics.FillPath($blueBrush, $outer)
            } finally {
                $blueBrush.Dispose()
                $outer.Dispose()
            }
        } else {
            $graphics.Clear($blue)
        }

        $scale = $Size / 180.0
        $framePath = New-RoundedRectanglePath -X (54 * $scale) -Y (54 * $scale) -Width (72 * $scale) -Height (72 * $scale) -Radius (20 * $scale)

        $framePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, (8.5 * $scale))
        try {
            $graphics.DrawPath($framePen, $framePath)
        } finally {
            $framePen.Dispose()
            $framePath.Dispose()
        }

        $dotBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
        try {
            $graphics.FillEllipse($dotBrush, (105 * $scale), (61.5 * $scale), (19 * $scale), (19 * $scale))
        } finally {
            $dotBrush.Dispose()
        }

        foreach ($name in $Names) {
            $bitmap.Save((Join-Path $OutputDirectory $name), [System.Drawing.Imaging.ImageFormat]::Png)
        }
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

# iOS expects full-bleed artwork and applies its own system mask.
Write-Icon -Size 180 -Names @("icon-180.png", "apple-touch-icon.png", "apple-touch-icon-v2.png")

# Windows displays PWA icons largely as-authored, so bake the rounded silhouette
# into the PNG alpha channel instead of relying on the OS to mask it.
Write-Icon -Size 192 -Names @("icon-192.png", "icon-192-v2.png") -RoundedCanvas
Write-Icon -Size 512 -Names @("icon-512.png", "icon-512-v2.png", "icon-512-maskable.png", "icon-512-maskable-v2.png") -RoundedCanvas
