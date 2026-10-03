// Workspaces do monorepo, lidos do package.json raiz (padrões no formato `pasta/*`).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const patterns = JSON.parse(readFileSync('package.json', 'utf8')).workspaces;

export const workspaces = patterns.flatMap((pattern) => {
  const parent = pattern.replace(/\/\*$/, '');
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(parent, entry.name, 'package.json')))
    .map((entry) => `${parent}/${entry.name}`);
});

// Um workspace sem src/ ainda não tem o que checar: foi criado no setup e será implementado numa feature.
export const hasSources = (workspace) => existsSync(join(workspace, 'src'));
