import request from 'supertest';
import { createApp } from '../src/app';
import { UserModel } from '../src/models/user.model';

describe('Rotas', () => {
  const app = createApp();

  beforeEach(() => UserModel.clear());

  it('GET / renderiza a home', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Bem-vindo');
  });

  it('POST /users cria usuário e redireciona', async () => {
    const res = await request(app).post('/users').type('form').send({ name: 'Ana', email: 'ana@exemplo.com' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/users');

    const list = await request(app).get('/users');
    expect(list.text).toContain('Ana');
  });

  it('POST /users sem dados retorna 400', async () => {
    const res = await request(app).post('/users').type('form').send({});
    expect(res.status).toBe(400);
  });

  it('POST /users com campos que não são texto retorna 400', async () => {
    const res = await request(app).post('/users').send({ name: 123, email: ['x'] });
    expect(res.status).toBe(400);
    expect(UserModel.findAll()).toHaveLength(0);
  });

  it('GET /users/:id mostra o usuário existente', async () => {
    const user = UserModel.create({ name: 'Bia', email: 'bia@exemplo.com' });
    const res = await request(app).get(`/users/${user.id}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('bia@exemplo.com');
  });

  it('GET /users/:id inexistente retorna 404', async () => {
    const res = await request(app).get('/users/999');
    expect(res.status).toBe(404);
  });

  it('rota inexistente retorna 404', async () => {
    const res = await request(app).get('/nao-existe');
    expect(res.status).toBe(404);
  });
});
