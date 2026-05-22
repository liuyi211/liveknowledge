"# liveknowledge" 

rmdir /s /q .next && npm run dev
Remove-Item -Recurse -Force .next; npm run dev

[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

npx kill-port 3001 && npm run dev
npx kill-port 3001; npm run dev

npm run db:migrate