@echo off
net session >nul 2>&1 || (echo Execute como administrador.&pause&exit /b 1)
attrib -r -s -h C:\Windows\System32\drivers\etc\hosts
(
echo 127.0.0.1 localhost
echo ::1 localhost
)>C:\Windows\System32\drivers\etc\hosts
ipconfig /flushdns
netsh winsock reset
netsh int ip reset
netsh winhttp reset proxy
shutdown /r /t 20
