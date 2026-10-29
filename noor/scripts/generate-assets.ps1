$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root "icons"
$assetsDir = Join-Path $root "store-assets"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

function New-Icon {
  param(
    [int]$Size,
    [string]$Path
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 111, 92))
  $paper = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255))
  $line = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(20, 81, 67)), ([Math]::Max(1, $Size / 18))
  $accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 186, 73))

  $pad = [Math]::Max(2, [int]($Size * 0.125))
  $radius = [Math]::Max(4, [int]($Size * 0.16))
  $rect = New-Object System.Drawing.Rectangle $pad, $pad, ($Size - ($pad * 2)), ($Size - ($pad * 2))
  $shapePath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $shapePath.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $shapePath.AddArc(($rect.Right - $diameter), $rect.Y, $diameter, $diameter, 270, 90)
  $shapePath.AddArc(($rect.Right - $diameter), ($rect.Bottom - $diameter), $diameter, $diameter, 0, 90)
  $shapePath.AddArc($rect.X, ($rect.Bottom - $diameter), $diameter, $diameter, 90, 90)
  $shapePath.CloseFigure()
  $graphics.FillPath($bg, $shapePath)

  $paperRect = New-Object System.Drawing.Rectangle ([int]($Size * 0.28)), ([int]($Size * 0.21)), ([int]($Size * 0.44)), ([int]($Size * 0.58))
  $graphics.FillRectangle($paper, $paperRect)

  for ($i = 0; $i -lt 3; $i++) {
    $y = [int]($Size * (0.34 + ($i * 0.13)))
    $graphics.DrawLine($line, [int]($Size * 0.35), $y, [int]($Size * 0.63), $y)
  }

  $checkPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(245, 186, 73)), ([Math]::Max(2, $Size / 11))
  $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLines($checkPen, @(
    (New-Object System.Drawing.Point ([int]($Size * 0.34)), ([int]($Size * 0.69))),
    (New-Object System.Drawing.Point ([int]($Size * 0.45)), ([int]($Size * 0.79))),
    (New-Object System.Drawing.Point ([int]($Size * 0.68)), ([int]($Size * 0.52)))
  ))

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $shapePath.Dispose()
  $bitmap.Dispose()
}

function New-StoreImage {
  param(
    [int]$Width,
    [int]$Height,
    [string]$Path,
    [string]$Title,
    [string]$Subtitle
  )

  $bitmap = New-Object System.Drawing.Bitmap $Width, $Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $graphics.Clear([System.Drawing.Color]::FromArgb(246, 247, 244))

  $green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 111, 92))
  $ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(23, 32, 27))
  $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(93, 104, 96))
  $panelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(223, 229, 221)), 2

  $margin = [int]($Width * 0.08)
  $titleFont = New-Object System.Drawing.Font "Tahoma", ([Math]::Max(24, [int]($Height * 0.08))), ([System.Drawing.FontStyle]::Bold)
  $subFont = New-Object System.Drawing.Font "Tahoma", ([Math]::Max(13, [int]($Height * 0.035))), ([System.Drawing.FontStyle]::Regular)
  $labelFont = New-Object System.Drawing.Font "Tahoma", ([Math]::Max(12, [int]($Height * 0.028))), ([System.Drawing.FontStyle]::Bold)

  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Far
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $format.FormatFlags = [System.Drawing.StringFormatFlags]::DirectionRightToLeft

  $graphics.DrawString($Title, $titleFont, $ink, (New-Object System.Drawing.RectangleF $margin, ([int]($Height * 0.12)), ($Width - $margin * 2), ([int]($Height * 0.16))), $format)
  $graphics.DrawString($Subtitle, $subFont, $muted, (New-Object System.Drawing.RectangleF $margin, ([int]($Height * 0.28)), ($Width - $margin * 2), ([int]($Height * 0.12))), $format)

  $cardX = [int]($Width * 0.18)
  $cardY = [int]($Height * 0.44)
  $cardW = [int]($Width * 0.64)
  $cardH = [int]($Height * 0.36)
  $graphics.FillRectangle($panelBrush, $cardX, $cardY, $cardW, $cardH)
  $graphics.DrawRectangle($linePen, $cardX, $cardY, $cardW, $cardH)

  $buttonBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 111, 92))
  $buttonRect = New-Object System.Drawing.Rectangle ([int]($cardX + $cardW * 0.08)), ([int]($cardY + $cardH * 0.68)), ([int]($cardW * 0.84)), ([int]($cardH * 0.18))
  $graphics.FillRectangle($buttonBrush, $buttonRect)
  $graphics.DrawString("تعبئة صفحة نور", $labelFont, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF $buttonRect.X, ($buttonRect.Y + 8), $buttonRect.Width, $buttonRect.Height), $format)

  $fieldBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(246, 247, 244))
  for ($i = 0; $i -lt 3; $i++) {
    $fieldY = [int]($cardY + $cardH * (0.12 + $i * 0.17))
    $graphics.FillRectangle($fieldBrush, ([int]($cardX + $cardW * 0.08)), $fieldY, ([int]($cardW * 0.84)), ([int]($cardH * 0.1)))
  }

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-Icon -Size 16 -Path (Join-Path $iconsDir "icon16.png")
New-Icon -Size 32 -Path (Join-Path $iconsDir "icon32.png")
New-Icon -Size 48 -Path (Join-Path $iconsDir "icon48.png")
New-Icon -Size 128 -Path (Join-Path $iconsDir "icon128.png")

New-StoreImage -Width 1280 -Height 800 -Path (Join-Path $assetsDir "screenshot-1280x800.png") -Title "Noor Lesson Prep Autofill" -Subtitle "Save preparation text locally and fill Noor preparation pages with one click"
New-StoreImage -Width 440 -Height 280 -Path (Join-Path $assetsDir "small-promo-440x280.png") -Title "Noor Prep" -Subtitle "Local, review-before-save autofill"

Write-Output "Assets generated in $iconsDir and $assetsDir"
