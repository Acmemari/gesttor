import * as fs from 'fs';

const filePath = 'c:/gesttor/src/DB/repositories/pessoas.ts';
let content = fs.readFileSync(filePath, 'utf-8');

content = content.replace(/personFazendas/g, 'personFarms');
content = content.replace(/personPerfils/g, 'personProfiles');
content = content.replace(/personPermissoes/g, 'personPermissions');

fs.writeFileSync(filePath, content);
console.log('Renamed variables in pessoas.ts');
