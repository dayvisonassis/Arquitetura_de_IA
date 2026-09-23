export interface User {
  id: number;
  name: string;
  email: string;
}

export type CreateUserInput = Omit<User, 'id'>;

// Armazenamento em memória — substituir por um banco de dados real.
const users: User[] = [];
let nextId = 1;

export const UserModel = {
  findAll(): User[] {
    return [...users];
  },

  findById(id: number): User | undefined {
    return users.find((user) => user.id === id);
  },

  create(input: CreateUserInput): User {
    const user: User = { id: nextId++, ...input };
    users.push(user);
    return user;
  },

  clear(): void {
    users.length = 0;
    nextId = 1;
  },
};
