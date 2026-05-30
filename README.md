"# liveknowledge" 

rmdir /s /q .next && npm run dev
Remove-Item -Recurse -Force .next; npm run dev

[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

npx kill-port 3001 && npm run dev
npx kill-port 3001; npm run dev

npm run db:migrate
cd backend

# 跑全部 105 条
npm run eval:memory -- --user-id <uuid>

# 只跑 20 条指代消解
npm run eval:memory -- --user-id <uuid> --category coreference --limit 20

# 只跑长期记忆召回
npm run eval:memory -- --user-id <uuid> --category memory_recall

# 只跑长期记忆提取
npm run eval:memory -- --user-id <uuid> --category memory_extraction

# 只跑长会话超窗
npm run eval:memory -- --user-id <uuid> --category overflow