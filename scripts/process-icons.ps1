Add-Type -AssemblyName System.Drawing

$srcPath = "c:\Users\hp\OneDrive\Desktop\Revora1\public\revora-brand.png"
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)
Write-Output "Image loaded: $($bmp.Width) x $($bmp.Height)"

# The background around (10, 10)
$bg = $bmp.GetPixel(10, 10)
Write-Output "Background color at (10,10): R=$($bg.R), G=$($bg.G), B=$($bg.B)"

# Clone for full clean brand
$cleanBmp = New-Object System.Drawing.Bitmap($bmp)
$g = [System.Drawing.Graphics]::FromImage($cleanBmp)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, $bg.R, $bg.G, $bg.B))

# Cover the "comments" box at top right (x >= 135, y <= 32)
$g.FillRectangle($brush, 135, 0, 152, 35)
$cleanBmp.Save("c:\Users\hp\OneDrive\Desktop\Revora1\public\revora-brand-clean.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Saved revora-brand-clean.png"

# Emblem: bounding box of circle is roughly x: 45..242 (width ~ 197), y: 22..219
# Let's crop centered 200x200
$cropX = [Math]::Max(0, [int]((287 - 204) / 2))
$cropY = 18
$cropW = 204
$cropH = 204
$emblemRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
$emblemBmp = $cleanBmp.Clone($emblemRect, $cleanBmp.PixelFormat)
$emblemBmp.Save("c:\Users\hp\OneDrive\Desktop\Revora1\public\revora-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Saved revora-icon.png ($($cropW)x$($cropH))"

$g.Dispose()
$brush.Dispose()
$bmp.Dispose()
$cleanBmp.Dispose()
$emblemBmp.Dispose()
