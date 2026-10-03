import { NextFunction, Request, Response } from 'express';
import { errorHandler } from '../src/middlewares/error-handler';

describe('errorHandler', () => {
  it('responde 500 com a página de erro e registra o erro', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const render = jest.fn();
    const status = jest.fn().mockReturnValue({ render });
    const res = { status } as unknown as Response;
    const err = new Error('falhou');

    errorHandler(err, {} as Request, res, jest.fn() as NextFunction);

    expect(status).toHaveBeenCalledWith(500);
    expect(render).toHaveBeenCalledWith('500', { title: 'Erro' });
    expect(consoleError).toHaveBeenCalledWith(err);
    consoleError.mockRestore();
  });
});
