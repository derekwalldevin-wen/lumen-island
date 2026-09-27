@echo off
setlocal
cd /d "%~dp0"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo 未找到 npm.cmd，请先安装 Node.js 18+。
  pause
  exit /b 1
)
if not exist node_modules (
  echo 正在安装依赖...
  call npm.cmd install || (echo 依赖安装失败 & pause & exit /b 1)
)
echo.
echo 灯火小岛开发服务器：http://localhost:5188/
echo 关闭此窗口即可停止服务器。
call npm.cmd run dev
