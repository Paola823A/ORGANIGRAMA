import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {root} from '../src/config/index.js';
const moduleUrl=new URL('../src/config/index.js',import.meta.url).href;
function read(overrides={}) {
  return spawnSync(process.execPath,['--input-type=module','-e',`import {config} from ${JSON.stringify(moduleUrl)};process.stdout.write(JSON.stringify(config));`],{
    cwd:path.parse(root).root,
    env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'4567',DATABASE_PATH:'data/config-test.sqlite',AUTH_REQUIRED:'true',AUTH_SECURE_COOKIES:'true',...overrides},encoding:'utf8'
  });
}
test('configuración: variables del sistema prevalecen sobre .env y rutas relativas parten del proyecto',()=>{
  const result=read();assert.equal(result.status,0,result.stderr);
  const config=JSON.parse(result.stdout);
  assert.equal(config.port,4567);assert.equal(config.authRequired,true);assert.equal(config.secureCookies,true);
  assert.equal(config.database,path.join(root,'data','config-test.sqlite'));
  assert.equal(config.development,false);
  assert.equal(JSON.parse(read({NODE_ENV:'development'}).stdout).development,true);
});
test('configuración: rechaza puertos y opciones de seguridad mal escritos',()=>{
  for(const overrides of [{PORT:'0'},{PORT:'70000'},{PORT:'texto'},{AUTH_REQUIRED:'verdadero'},{AUTH_SECURE_COOKIES:'yes'}]) assert.notEqual(read(overrides).status,0);
});
