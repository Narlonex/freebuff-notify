@echo off
chcp 65001
rem One-time setup for notify - configures Telegram (and optionally WhatsApp).
rem Usage: setup.cmd (double-click) or setup.cmd --telegram-token TOKEN
node "%~dp0setup.mjs" %*
if "%~1"=="" pause
exit /b %ERRORLEVEL%
