import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectedGraph } from '../../frontend/src/services/exportSelection.js';
import { manualNode } from './helpers.js';
import { graphBounds,pdfGeometry,isCompleteInTile } from '../../frontend/src/services/exportGeometry.js';
test('PDF selección: todo cabe en una página aunque las tarjetas estén muy separadas',()=>{
  const nodes=[manualNode('a',{position:{x:-300,y:-500}}),manualNode('b',{position:{x:18000,y:12000}})];
  const bounds=graphBounds(nodes),geometry=pdfGeometry(nodes,bounds,true);
  assert.equal(geometry.cols*geometry.rows,1);
  for(const node of nodes) assert.ok(isCompleteInTile(node,bounds,0,0,geometry.tileWidth,geometry.tileHeight));
  assert.ok(pdfGeometry(nodes,bounds).cols*pdfGeometry(nodes,bounds).rows>1);
});
test('PDF selección: conserva tarjetas, coordenadas y trazados; incluye uniones internas sin ramas ajenas',()=>{
  const graph={nodes:['boss','a','b','other'].map((id,i)=>manualNode(id,{position:{x:i*400,y:i*100}})),edges:[]};
  graph.nodes.push(manualNode('j',{type:'JUNCTION'}),manualNode('outer',{type:'JUNCTION'}));
  graph.edges=[['boss','j'],['j','a'],['j','b'],['j','outer'],['outer','other']].map(([source,target],i)=>({id:String(i),source,target,layoutPath:'M0 0L1 1'}));
  const before=JSON.stringify(graph);
  const result=selectedGraph(graph,new Set(['boss','a']));
  assert.deepEqual(result.nodes.map(n=>n.id),['boss','a','j']);
  assert.deepEqual(result.edges.map(e=>e.id),['0','1']);
  assert.equal(result.nodes[1].position.x,400);
  assert.equal(result.edges[0].layoutPath,'M0 0L1 1');
  assert.equal(JSON.stringify(graph),before);
  assert.equal(selectedGraph(graph,[]).nodes.length,0);
  assert.deepEqual(selectedGraph(graph,['a','missing']).nodes.map(n=>n.id),['a']);
});
