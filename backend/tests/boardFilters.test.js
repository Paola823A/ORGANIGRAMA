import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boardOptions,matchesBoard,positionGroup,positionCounts} from '../../frontend/src/services/boardFilters.js';
test('contador de puestos: personas únicas del filtro, sin cesados, ausentes ni copias visuales',()=>{
 const node=(id,branch='Lima',extra={})=>({id,employeeId:id,type:'EMPLOYEE',subtitle:'JEFE DE TALLER',metadata:{branch,...extra}});
 const nodes=[node('a'),node('a'),node('visual','Lima',{visualOnly:true}),node('c','Lima',{employmentStatus:'CEASED'}),node('d','Lima',{employmentStatus:'ABSENT'}),node('e','Cusco')];
 assert.equal(positionCounts(nodes,{branch:'Lima',position:'Técnicos'}).Jefes,1);
 assert.equal(positionCounts(nodes,{branch:'Cusco'}).Jefes,1);
 assert.equal(positionCounts(nodes).Jefes,2);
 assert.deepEqual(positionCounts(nodes,{branch:'Otra'}),{});
});
test('Board: filtros relacionados en ambas direcciones y categorías de puesto',()=>{
 const nodes=[{type:'EMPLOYEE',subtitle:'JEFE DE TALLER',metadata:{businessLine:'Post venta',branch:'Lima',area:'Taller'}},{type:'EMPLOYEE',subtitle:'TECNICO MECANICO',metadata:{businessLine:'Post venta',branch:'Cusco',area:'Servicio'}},{type:'EMPLOYEE',subtitle:'AUXILIAR',metadata:{businessLine:'Ventas',branch:'Lima',area:'Comercial'}}];
 assert.deepEqual(boardOptions(nodes,{businessLine:'Post venta'}).branch,['Cusco','Lima']);
 assert.deepEqual(boardOptions(nodes,{branch:'Cusco'}).businessLine,['Post venta']);
 assert.deepEqual(boardOptions(nodes,{position:'Técnicos'}).area,['Servicio']);
 assert.equal(matchesBoard(nodes[0],{position:'Jefes',branch:'Lima'}),true);
 assert.equal(matchesBoard(nodes[2],{position:'Jefes'}),false);
 assert.equal(positionGroup('SUPERVISOR DE VENTAS'),'Supervisores');
});
