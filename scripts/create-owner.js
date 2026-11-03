import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { openDatabase } from '../backend/src/db/index.js';
import { authService } from '../backend/src/modules/auth/service.js';
const db = openDatabase();
const auth = authService(db);
let muted = false;
const output = new Writable({ write(chunk,_encoding,done) { if (!muted) process.stdout.write(chunk); done(); } });
const prompt = createInterface({ input:process.stdin,output,terminal:true });
try {
  if (auth.enabled()) throw new Error('La cuenta del creador ya existe. No se ha modificado.');
  const displayName = await prompt.question('Nombre del creador: ');
  const username = await prompt.question('Usuario o correo: ');
  process.stdout.write('Contraseña (mínimo 6 caracteres, sin límite máximo; no se mostrará): ');
  muted = true;
  const password = await prompt.question('');
  muted = false;
  process.stdout.write('\nRepite la contraseña: ');
  muted = true;
  const confirmation = await prompt.question('');
  muted = false;
  process.stdout.write('\n');
  if (password !== confirmation) throw new Error('Las contraseñas no coinciden.');
  await auth.create({displayName,username,password},true);
  console.log('Cuenta del creador creada. Inicia sesión en la aplicación.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { prompt.close();db.close(); }
