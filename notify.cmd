@echo off
rem Obal, aby sa notifikátor dal zavolať z akéhokoľvek projektu aj s medzerou v ceste.
rem Použitie: "C:\Users\PC\Desktop\Projects\message bot\notify.cmd" done "text"
node "%~dp0notify.mjs" %*
exit /b %ERRORLEVEL%
