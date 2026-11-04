import {test} from 'node:test';
import assert from 'node:assert/strict';
import {manualNode} from './helpers.js';
import {splitGraphEdge} from '../../frontend/src/services/edgeRouting.js';
import {validateGraph} from '../../shared/graph.js';
import {useEditor} from '../../frontend/src/composables/useEditor.js';
test('arrastrar línea: una unión reposiciona la conexión conservando tarjetas, estilo y un solo deshacer',()=>{
  const graph={nodes:[manualNode('a'),manualNode('b',{type:'POSITION',position:{x:500,y:300}})],edges:[{id:'e',source:'a',target:'b',style:{color:'#555555',width:2,lineType:'dashed',sourceHandle:'source-right',targetHandle:'target-left'}}]};
  const before=JSON.stringify(graph);
  for(const direction of ['up','down','left','right']) {
    const next=splitGraphEdge(graph,'e',{x:320,y:170},direction,'junction','new-edge');
    validateGraph(next);
    assert.deepEqual(next.nodes.slice(0,2),graph.nodes);
    assert.deepEqual(next.nodes[2].position,{x:316,y:166});
    assert.equal(next.edges[0].style.sourceHandle,'source-right');
    assert.equal(next.edges[1].style.targetHandle,'target-left');
    assert.ok(next.edges.every(e=>e.style.color==='#555555' && e.style.width===2 && e.style.lineType==='dashed'));
  }
  assert.equal(JSON.stringify(graph),before);
  const editor=useEditor();editor.load(graph);editor.splitEdge('e',{x:320,y:170},'right');
  assert.equal(editor.past.value.length,1);editor.undo();assert.deepEqual(editor.graph.value,graph);
});
