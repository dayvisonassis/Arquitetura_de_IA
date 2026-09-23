import { Request, Response } from 'express';

export const HomeController = {
  index: (_req: Request, res: Response): void => {
    res.render('home', { title: 'Início' });
  },
};
