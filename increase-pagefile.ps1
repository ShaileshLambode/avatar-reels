# Disable automatic pagefile management
$sys = Get-CimInstance Win32_ComputerSystem
$sys.AutomaticManagedPagefile = $false
Set-CimInstance -CimInstance $sys

# Set C: pagefile size to 64GB - 80GB
$pagefile = Get-CimInstance Win32_PageFileSetting | Where-Object {$_.Name -like "C:*"}
if ($pagefile) {
    $pagefile.InitialSize = 65536
    $pagefile.MaximumSize = 80000
    Set-CimInstance -CimInstance $pagefile
    Write-Host "Pagefile updated to 64GB - 80GB."
} else {
    New-CimInstance -ClassName Win32_PageFileSetting -Property @{Name="C:\pagefile.sys"; InitialSize=65536; MaximumSize=80000}
    Write-Host "New pagefile created at C:\pagefile.sys with size 64GB - 80GB."
}
