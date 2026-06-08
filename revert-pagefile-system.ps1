# Revert pagefile configuration to Windows System Managed
$sys = Get-CimInstance Win32_ComputerSystem
$sys.AutomaticManagedPagefile = $true
Set-CimInstance -CimInstance $sys

Write-Host "Automatic pagefile management enabled successfully."
Write-Host "Please RESTART your laptop to apply these changes and free up disk space."
