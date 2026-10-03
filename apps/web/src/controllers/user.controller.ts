import { Request, Response } from 'express';
import { CreateUserInput, UserModel } from '../models/user.model';

function parseCreateUser(body: unknown): CreateUserInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const { name, email } = body as Record<string, unknown>;
  if (typeof name !== 'string' || typeof email !== 'string') return null;
  if (!name.trim() || !email.trim()) return null;
  return { name: name.trim(), email: email.trim() };
}

export const UserController = {
  index: (_req: Request, res: Response): void => {
    res.render('users/index', { title: 'Usuários', users: UserModel.findAll() });
  },

  show: (req: Request<{ id: string }>, res: Response): void => {
    const user = UserModel.findById(Number(req.params.id));
    if (!user) {
      res.status(404).render('404', { title: 'Não encontrado' });
      return;
    }
    res.render('users/show', { title: user.name, user });
  },

  create: (req: Request<Record<string, string>, unknown, unknown>, res: Response): void => {
    const input = parseCreateUser(req.body);
    if (!input) {
      res.status(400).render('users/index', {
        title: 'Usuários',
        users: UserModel.findAll(),
        error: 'Nome e e-mail são obrigatórios.',
      });
      return;
    }
    UserModel.create(input);
    res.redirect('/users');
  },
};
