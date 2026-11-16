import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {book,person} from './helpers.js';
import {readWorkbook,MAIN_SHEET,MAPPINGS} from '../src/modules/imports/reader.js';
test('importación acepta Línea de negocio y mantiene compatibilidad con GIRO en activos y cesados',()=>{
 const buffer=book([person('00000001')],[person('00000002')]);
 assert.equal(readWorkbook(buffer).records.length,2);
 const workbook=XLSX.read(buffer,{type:'buffer'});
 for(const name of [MAIN_SHEET,'CESADOS']) workbook.Sheets[name][`${MAPPINGS[name].businessLine}3`]={t:'s',v:'Línea de negocio'};
 const parsed=readWorkbook(XLSX.write(workbook,{type:'buffer',bookType:'xlsm'}));
 assert.equal(parsed.records.length,2);
 assert.ok(parsed.records.every(r=>r.businessLine==='Giro A'));
});
