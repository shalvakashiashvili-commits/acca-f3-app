# აპლიკაციის ხატულების გენერაცია (PNG) Windows-ის System.Drawing-ით.
# გაშვება: powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force $out | Out-Null

function New-Icon([int]$size, [string]$file, [bool]$maskable, [bool]$rounded) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([System.Drawing.Color]::Transparent)

  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 36, 87, 197))
  if ($rounded) {
    $r = [int]($size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
    $path.AddArc($size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
    $path.AddArc($size - $r * 2, $size - $r * 2, $r * 2, $r * 2, 0, 90)
    $path.AddArc(0, $size - $r * 2, $r * 2, $r * 2, 90, 90)
    $path.CloseFigure()
    $g.FillPath($bg, $path)
  } else {
    $g.FillRectangle($bg, 0, 0, $size, $size)
  }

  # maskable: შიგთავსი უსაფრთხო ზონაში (ცენტრალური ~60%)
  $scale = if ($maskable) { 0.62 } else { 0.8 }
  $white = [System.Drawing.Brushes]::White
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'

  $big = New-Object System.Drawing.Font 'Segoe UI', ([float]($size * 0.40 * $scale)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $small = New-Object System.Drawing.Font 'Segoe UI', ([float]($size * 0.15 * $scale)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $cy = $size / 2
  $g.DrawString('ACCA', $small, $white, (New-Object System.Drawing.RectangleF 0, ($cy - $size * 0.30 * $scale), $size, ($size * 0.2 * $scale)), $fmt)
  $g.DrawString('F3', $big, $white, (New-Object System.Drawing.RectangleF 0, ($cy - $size * 0.12 * $scale), $size, ($size * 0.5 * $scale)), $fmt)

  # ქვედა ხაზი (მწვანე „ჩაბარებულია“)
  $green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 76, 197, 132))
  $w = $size * 0.36 * $scale
  $g.FillRectangle($green, [float](($size - $w) / 2), [float]($cy + $size * 0.36 * $scale), [float]$w, [float]($size * 0.045 * $scale))

  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

New-Icon 192 'icon-192.png' $false $true
New-Icon 512 'icon-512.png' $false $true
New-Icon 512 'maskable-512.png' $true $false
New-Icon 180 'apple-touch-icon.png' $false $false   # iOS თავად ამრგვალებს კუთხეებს
Write-Output 'icons ok'
