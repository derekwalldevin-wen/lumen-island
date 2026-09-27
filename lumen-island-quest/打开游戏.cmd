@echo off
setlocal
set "GAME=%~dp0play-lumen-island.html"
if not exist "%GAME%" (
  echo GAME FILE NOT FOUND:
  echo "%GAME%"
  echo Please keep this launcher beside play-lumen-island.html.
  pause
  exit /b 1
)
explorer.exe "%GAME%"
endlocal
