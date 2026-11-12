import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boardOptions,matchesBoard,positionGroup} from '../../frontend/src/services/boardFilters.js';
test('Board: filtros relacionados en ambas direcciones y categorías de puesto',()=>{
 const nodes=[{type:'EMPLOYEE',subtitle:'JEFE DE TALLER',metadata:{businessLine:'Post venta',branch:'Lima',area:'Taller'}},{type:'EMPLOYEE',subtitle:'TECNICO MECANICO',metadata:{businessLine:'Post venta',branch:'Cusco',area:'Servicio'}},{type:'EMPLOYEE',subtitle:'AUXILIAR',metadata:{businessLine:'Ventas',branch:'Lima',area:'Comercial'}}];
 assert.deepEqual(boardOptions(nodes,{businessLine:'Post venta'}).branch,['Cusco','Lima']);
 assert.deepEqual(boardOptions(nodes,{branch:'Cusco'}).businessLine,['Post venta']);
 assert.deepEqual(boardOptions(nodes,{position:'Técnicos'}).area,['Servicio']);
 assert.equal(matchesBoard(nodes[0],{position:'Jefes',branch:'Lima'}),true);
 assert.equal(matchesBoard(nodes[2],{position:'Jefes'}),false);
 assert.equal(positionGroup('SUPERVISOR DE VENTAS'),'Supervisores');
});
