import { UserModel } from '../src/models/user.model';

describe('UserModel', () => {
  beforeEach(() => UserModel.clear());

  it('cria e busca um usuário', () => {
    const user = UserModel.create({ name: 'Ana', email: 'ana@exemplo.com' });

    expect(user.id).toBe(1);
    expect(UserModel.findById(1)).toEqual(user);
    expect(UserModel.findAll()).toHaveLength(1);
  });

  it('retorna undefined para id inexistente', () => {
    expect(UserModel.findById(99)).toBeUndefined();
  });
});
