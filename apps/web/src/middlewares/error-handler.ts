import { NextFunction, Request, Response } from 'express';

export function notFound(_req: Request, res: Response): void {
  res.status(404).render('404', { title: 'Não encontrado' });
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error(err);
  res.status(500).render('500', { title: 'Erro' });
}
