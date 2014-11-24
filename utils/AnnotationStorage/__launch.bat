@echo off
rem TODO: check that mongodb is installed and in the path first
start mongod --dbpath ./db

IF NOT EXIST node_modules GOTO NEED_TO_RUN_NPM_INSTALL
start node server.js
GOTO END

:NEED_TO_RUN_NPM_INSTALL
echo You need to run 'npm install' from this folder first!
echo Doing it for you :-)
npm install && cls && start node server.js
pause

:END
