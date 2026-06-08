# Revert pagefile configuration to 32GB - 40GB
$sys = Get-CimInstance Win32_ComputerSystem
$sys.AutomaticManagedPagefile = $false
Set-CimInstance -CimInstance $sys

$pagefile = Get-CimInstance Win32_PageFileSetting | Where-Object {$_.Name -like "C:*"}
if ($pagefile) {
    $pagefile.InitialSize = 32768
    $pagefile.MaximumSize = 40960
    Set-CimInstance -CimInstance $pagefile
    Write-Host "Pagefile reverted to 32GB - 40GB."
}
