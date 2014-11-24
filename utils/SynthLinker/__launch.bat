@echo off
IF NOT EXIST node_modules GOTO NEED_TO_RUN_NPM_INSTALL
node server.js
GOTO END

:NEED_TO_RUN_NPM_INSTALL
echo You need to run 'npm install' from this folder first!
echo Doing it for you :-)
npm install && cls && node server.js

:END
