import path from 'node:path';
import express from 'express';
import routes from './routes';
import { errorHandler, notFound } from './middlewares/error-handler';

const rootDir = path.resolve(__dirname, '..');

export function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(rootDir, 'views'));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.static(path.join(rootDir, 'public')));

  app.use(routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
