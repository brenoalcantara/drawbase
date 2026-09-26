import { createApp } from './app';

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = '0.0.0.0';

async function start() {
  const app = await createApp();
  const port = Number.parseInt(process.env.PORT ?? `${DEFAULT_PORT}`, 10);
  const host = process.env.HOST ?? DEFAULT_HOST;

  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error({ err: error }, 'Failed to start DrawBase API');
    process.exit(1);
  }
}

void start();
