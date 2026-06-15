@echo off
set "NODE_DIR=C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.16.0-win-x64"
set "PATH=%NODE_DIR%;%PATH%"
cd /d "%~dp0"
npm run dev
