# Refaz o atlas do zero. Um processo por vez (o PC ja travou com varios em paralelo).
$b = "C:\Blender\blender.exe"
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $aqui
foreach ($s in "01_cache.py", "05_walk_cru.py", "06_idle_cru.py", "07_pos.py", "08_saidas.py") {
  Write-Host "== $s"
  & $b --background --factory-startup --python $s
  if ($LASTEXITCODE -ne 0) { throw "falhou: $s" }
}
# opcionais de conferencia: 02_medir.py, 03_marcos.py, 04_debug_pares.py -- front|back, ver_cru.py, recorte.py
