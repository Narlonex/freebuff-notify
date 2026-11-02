@echo off
chcp 65001
rem Old name kept for compatibility - the setup wizard is setup.cmd now.
call "%~dp0setup.cmd" %*
exit /b %ERRORLEVEL%
