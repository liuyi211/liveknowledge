import { buildApp } from './app.js';

async function start() {
  const app = await buildApp();

  try {
    const port = Number(process.env.PORT) || 3001;
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`后端服务已启动：http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
