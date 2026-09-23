import { env } from './config/env';
import { createApp } from './app';

createApp().listen(env.port, () => {
  console.log(`Servidor rodando em http://localhost:${env.port} (${env.nodeEnv})`);
});
