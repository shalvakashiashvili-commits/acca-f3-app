# ლოკალური სერვერი ტესტირებისთვის (Node/Python არ სჭირდება).
# გაშვება: powershell -ExecutionPolicy Bypass -File tools/serve.ps1 [-Port 8080]
# შემდეგ გახსენი http://localhost:8080/
param([int]$Port = 8080)

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.webmanifest' = 'application/manifest+json'
  '.png' = 'image/png'; '.svg' = 'image/svg+xml'; '.woff2' = 'font/woff2'; '.wasm' = 'application/wasm'
  '.pfb' = 'application/octet-stream'; '.ttf' = 'font/ttf'; '.pdf' = 'application/pdf'; '.txt' = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Serving $root at http://localhost:$Port/"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($path.EndsWith('/')) { $path += 'index.html' }
      $file = Join-Path $root ($path.TrimStart('/') -replace '/', '\')
      $full = [IO.Path]::GetFullPath($file)
      $res = $ctx.Response
      if ($full.StartsWith($root) -and (Test-Path $full -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($full)
        $ext = [IO.Path]::GetExtension($full).ToLower()
        $res.ContentType = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-cache')
        $res.ContentLength64 = $bytes.Length
        if ($ctx.Request.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
        Write-Output "200 $path"
      } else {
        $res.StatusCode = 404
        Write-Output "404 $path"
      }
      $res.Close()
    } catch {
      # ერთი მოთხოვნის შეცდომამ სერვერი არ უნდა გააჩეროს (მაგ. კავშირი გაწყდა)
      Write-Output "ERR $($_.Exception.Message)"
      try { $ctx.Response.Abort() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
