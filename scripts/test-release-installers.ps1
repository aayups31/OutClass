$ErrorActionPreference = 'Stop'
$releaseRoot = (Resolve-Path (Join-Path $PSScriptRoot '../dist/releases')).Path
$testRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.local/installed-release-tests'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
foreach ($edition in @('learn', 'educator')) {
  $product = if ($edition -eq 'learn') { 'OutClass Learn' } else { 'OutClass Educator' }
  $installer = Get-ChildItem -LiteralPath (Join-Path $releaseRoot $edition) -Filter '*Setup-*.exe' | Select-Object -First 1
  if (!$installer) { throw "Missing $edition installer" }
  $destination = Join-Path $testRoot $edition
  $process = Start-Process -FilePath $installer.FullName -ArgumentList @('/S', "/D=$destination") -WindowStyle Hidden -PassThru -Wait
  if ($process.ExitCode -ne 0) { throw "Installer failed: $edition ($($process.ExitCode))" }
  $executable = Join-Path $destination "$product.exe"
  if (!(Test-Path -LiteralPath $executable)) { throw "Installed executable is missing: $edition" }
  $env:GITLEARN_PACKAGED_TEST = $executable
  $env:GITLEARN_EXPECTED_PRODUCT_NAME = $product
  try {
    npx playwright test --config playwright.desktop.config.ts tests/desktop/account.spec.ts
    if ($LASTEXITCODE -ne 0) { throw "Installed account smoke test failed: $edition" }
  } finally {
    Remove-Item Env:GITLEARN_PACKAGED_TEST -ErrorAction SilentlyContinue
    Remove-Item Env:GITLEARN_EXPECTED_PRODUCT_NAME -ErrorAction SilentlyContinue
  }
  $uninstaller = Get-ChildItem -LiteralPath $destination -Filter '*Uninstall*.exe' | Select-Object -First 1
  if (!$uninstaller) { throw "Missing uninstaller: $edition" }
  $removed = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
  if ($removed.ExitCode -ne 0) { throw "Uninstall failed: $edition" }
  Write-Output "Verified NSIS install, encrypted-account restart/sign-out, and uninstall: $product"
}
