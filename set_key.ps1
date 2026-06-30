$path = "e:\IMP projects\Udaya\udaya_temp.pem"
Copy-Item "C:\Users\Roshan Raj\Desktop\Udaya.pem" $path -Force
$acl = Get-Acl $path
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($env:USERNAME, "Read", "Allow")
$acl.SetAccessRule($rule)
Set-Acl $path $acl
Write-Host "Permissions set successfully on $path"
