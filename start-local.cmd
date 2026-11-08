@echo off
rem Starts the whole app at http://localhost:8080. Press Ctrl+C in this window to stop it.
setlocal
set TEMP=D:\dev-cache\tmp
set TMP=D:\dev-cache\tmp
set NG_CLI_ANALYTICS=false
cd /d "%~dp0"

if not exist web\dist\web\browser\index.html (
  echo Building the web app...
  pushd web
  call npx ng build || exit /b 1
  popd
)

cd backend
if not exist target\backend-0.1.0.jar (
  echo Building the backend...
  set MAVEN_OPTS=-Djava.io.tmpdir=D:/dev-cache/tmp
  call mvn -q -B -DskipTests package || exit /b 1
)

if not exist .local-data mkdir .local-data
echo Starting at http://localhost:8080 ...
java -Djava.io.tmpdir=D:/dev-cache/tmp -Xmx512m -jar target\backend-0.1.0.jar --spring.profiles.active=local
