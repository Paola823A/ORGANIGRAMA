import {test} from 'node:test';
import assert from 'node:assert/strict';
import {manualNode} from './helpers.js';
import {generalBusinessSheet,copyGeneralBusinessStructures} from '../../frontend/src/services/generalBusinessSheet.js';
import {nodesInRectangle,rectangleBounds} from '../../frontend/src/services/rectangleSelection.js';
import {useEditor} from '../../frontend/src/composables/useEditor.js';
import {validateGraph} from '../../shared/graph.js';

test('copia del General: gerente, sedes y subestructuras conservan relaciones, tamaños y distancias internas',()=>{
 const employee=(id,branch,position)=>manualNode(id,{type:'EMPLOYEE',employeeId:id,title:id,subtitle:id==='manager'?'GERENTE':'TECNICO',metadata:{businessLine:'SERVICIOS',branch},position});
 const graph={nodes:[employee('manager','AREQUIPA',{x:700,y:10}),employee('boss','AREQUIPA',{x:50,y:400}),manualNode('junction',{type:'JUNCTION',width:8,height:8,position:{x:180,y:600}}),employee('child','AREQUIPA',{x:450,y:700}),employee('cusco','CUSCO',{x:1000,y:600})],edges:[{id:'m',source:'manager',target:'boss'},{id:'a',source:'boss',target:'junction',style:{color:'#555555',width:2,lineType:'dashed',sourceHandle:'source-right',targetHandle:'target-left'}},{id:'b',source:'junction',target:'child'},{id:'c',source:'manager',target:'cusco'}]};
 graph.nodes[0].metadata.sheetViews={};
 const before=structuredClone(graph),copy=generalBusinessSheet(graph,'SERVICIOS');validateGraph(copy,true);
 assert.ok(copy.nodes.every(n=>!n.metadata.sheetViews));
 assert.deepEqual(graph,before);
 const find=id=>copy.nodes.find(n=>n.id===id),manager=find('manager');
 for(const branch of copy.nodes.filter(n=>n.type==='BRANCH')) {
  assert.ok(branch.position.y>manager.position.y+manager.height);
  assert.ok(copy.edges.some(e=>e.source===manager.id&&e.target===branch.id));
 }
 for(const id of ['boss','junction','child']) {assert.equal(find(id).width,graph.nodes.find(n=>n.id===id).width);assert.deepEqual(find(id).style,graph.nodes.find(n=>n.id===id).style);}
 assert.deepEqual(copy.edges.find(e=>e.id==='a'),graph.edges[1]);
 assert.equal(find('child').position.x-find('boss').position.x,400);
 assert.equal(find('child').position.y-find('boss').position.y,300);
 const protectedSheet={id:'post',name:'POST VENTA',kind:'BUSINESS',businessLine:'POST VENTA',graph:structuredClone(graph),deleted:false};
 const custom={...structuredClone(protectedSheet),id:'custom',name:'BORRADOR FUSO',kind:'CUSTOM'};
 const workspace={general:graph,sheets:[protectedSheet,custom,{id:'services',name:'SERVICIOS',kind:'BUSINESS',businessLine:'SERVICIOS',graph:null,deleted:false}]};
 const protectedBefore=JSON.stringify(protectedSheet),customBefore=JSON.stringify(custom);
 assert.equal(copyGeneralBusinessStructures(workspace).length,1);
 assert.equal(JSON.stringify(protectedSheet),protectedBefore);assert.equal(JSON.stringify(custom),customBefore);assert.deepEqual(workspace.general,before);
});

test('General: rectángulo en cualquier sentido y zoom selecciona varias tarjetas; mover y deshacer conserva separaciones',()=>{
 const graph={nodes:[manualNode('a',{position:{x:-500,y:200}}),manualNode('b',{position:{x:200,y:300}}),manualNode('outside',{position:{x:5000,y:5000}})],edges:[]};
 assert.deepEqual(rectangleBounds({x:500,y:500},{x:-600,y:100}),{x:-600,y:100,width:1100,height:400});
 for(const zoom of [.01,.1,1,2]) {
  const viewport={x:800,y:50},toScreen=p=>({x:p.x*zoom+viewport.x,y:p.y*zoom+viewport.y}),toFlow=p=>({x:(p.x-viewport.x)/zoom,y:(p.y-viewport.y)/zoom});
  const ids=nodesInRectangle(graph.nodes,toFlow(toScreen({x:500,y:500})),toFlow(toScreen({x:-600,y:100})));
  assert.deepEqual(ids,['a','b']);
 }
 const editor=useEditor();editor.load(graph);editor.selectNodes(['a','b']);
 editor.moveNodes(editor.graph.value.nodes.filter(n=>editor.selectedIds.value.has(n.id)).map(n=>({id:n.id,position:{x:n.position.x+100,y:n.position.y+200}})));
 assert.equal(editor.graph.value.nodes[1].position.x-editor.graph.value.nodes[0].position.x,700);
 assert.deepEqual(editor.graph.value.nodes[2],graph.nodes[2]);editor.undo();assert.deepEqual(editor.graph.value,graph);
});
