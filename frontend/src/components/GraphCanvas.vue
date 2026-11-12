<script setup>
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { ConnectionMode, SelectionMode, VueFlow, useVueFlow } from "@vue-flow/core";
import ChartCard from "./ChartCard.vue";
import JunctionNode from "./JunctionNode.vue";
import GroupHeading from "./GroupHeading.vue";
import CompactEdge from "./CompactEdge.vue";
import { anchorOutgoingLines, slidePosition } from "../services/graphMovement.js";
import { splitGraphEdge } from '../services/edgeRouting.js';
import { isGroupingNode, subordinateCounts } from "../../../shared/graph.js";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
const props = defineProps({
  graph: Object,
  hierarchyGraph: Object,
  editable: Boolean,
  showNames: { type: Boolean, default: true },
  collapsed: { type: Set, default: () => new Set() },
  highlight: String,
  highlightIds: {type:Array,default:()=>[]},
  selectedId: String,
  selectedIds: { type: Array, default: () => [] },
});
const emit = defineEmits([
  "select",
  "select-many",
  "select-edge",
  "move",
  "move-many",
  "connect",
  "reconnect",
  "toggle",
  "split-edge",
]);
const id = `chart-${crypto.randomUUID()}`;
const showHelp = ref(false), showSliders = ref(false), slideId = ref(null), preview = shallowRef(null);
const rectangleMode = ref(false);
const isDragging = ref(false);
const renderedGraph = computed(() => preview.value || props.graph);
const hierarchy = computed(() => props.hierarchyGraph || props.graph);
const teamCounts = computed(() => subordinateCounts(hierarchy.value));
const parentIds = computed(() => new Set(hierarchy.value.edges.map((edge) => edge.source)));
let dragState = null, ignoreClickUntil = 0, rectangleSelection = null;
const { fitView, setCenter, setViewport, viewport, dimensions, zoomIn, zoomOut, applyNodeChanges, screenToFlowCoordinate, getSelectedNodes, nodesSelectionActive } =
  useVueFlow(id);
function toggleRectangle(event) {
  if (!props.editable || !event.target.classList.contains("vue-flow__pane")) return;
  rectangleMode.value = !rectangleMode.value;
  slideId.value = null;
  event.currentTarget.focus({ preventScroll: true });
}
function finishRectangle() {
  if (!props.editable || !rectangleMode.value) return;
  const ids = getSelectedNodes.value.map((node) => node.id);
  rectangleSelection = new Set(ids);
  emit("select-many", ids);
  nodesSelectionActive.value = false;
  rectangleMode.value = false;
  ignoreClickUntil = Date.now() + 150;
}
let edgeDrag=null,lastEdgeClick=null;
function beginPointer(event) {
  rectangleSelection = null;
  if(!props.editable || event.button!==0 || event.target.closest('.vue-flow__edgeupdater')) return;
  const group=event.target.closest('.vue-flow__edge'),path=group?.querySelector('.vue-flow__edge-path');
  if(!path) return;
  const location=connectionLocation(event,path);
  if(!location) return;
  edgeDrag={id:group.getAttribute('data-id'),graph:props.graph,start:{x:event.clientX,y:event.clientY},...location,
    junctionId:crypto.randomUUID(),edgeId:crypto.randomUUID(),pointerId:event.pointerId,element:event.currentTarget,moved:false};
  event.stopPropagation();event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  window.addEventListener('pointermove',pullEdge);
  window.addEventListener('pointerup',finishEdge);
  window.addEventListener('pointercancel',cancelEdge);
}
function pullEdge(event) {
  if(!edgeDrag || event.pointerId!==edgeDrag.pointerId) return;
  if(!edgeDrag.moved && Math.hypot(event.clientX-edgeDrag.start.x,event.clientY-edgeDrag.start.y)<5) return;
  edgeDrag.moved=true;
  const cursor=screenToFlowCoordinate({x:event.clientX,y:event.clientY});
  const horizontal=['left','right'].includes(edgeDrag.direction);
  edgeDrag.position=horizontal ? {x:edgeDrag.position.x,y:cursor.y}:{x:cursor.x,y:edgeDrag.position.y};
  preview.value=splitGraphEdge(edgeDrag.graph,edgeDrag.id,edgeDrag.position,edgeDrag.direction,edgeDrag.junctionId,edgeDrag.edgeId);
}
function cancelEdge() {
  if(edgeDrag?.element.hasPointerCapture(edgeDrag.pointerId)) edgeDrag.element.releasePointerCapture(edgeDrag.pointerId);
  window.removeEventListener('pointermove',pullEdge);window.removeEventListener('pointerup',finishEdge);window.removeEventListener('pointercancel',cancelEdge);
  preview.value=null;edgeDrag=null;
}
function finishEdge(event) {
  if(!edgeDrag || event.pointerId!==edgeDrag.pointerId) return;
  pullEdge(event);
  const finished=edgeDrag;
  cancelEdge();
  if(finished.moved) {ignoreClickUntil=Date.now()+200;emit('split-edge',finished.id,finished.position,finished.direction);}
  else if(lastEdgeClick?.id===finished.id && Date.now()-lastEdgeClick.time<350) {
    lastEdgeClick=null;ignoreClickUntil=Date.now()+200;
    emit('split-edge',finished.id,finished.position,finished.direction);
  } else {lastEdgeClick={id:finished.id,time:Date.now()};emit('select-edge',finished.id);}
}
onBeforeUnmount(cancelEdge);
function clickPane() {
  if (Date.now() < ignoreClickUntil) return;
  slideId.value = null;
  emit("select", null);
}
const panBounds = computed(() => {
  const items = props.graph.nodes;
  if (!items.length) return null;
  return {
    x: [Math.min(...items.map((n) => n.position.x)), Math.max(...items.map((n) => n.position.x + n.width))],
    y: [Math.min(...items.map((n) => n.position.y)), Math.max(...items.map((n) => n.position.y + n.height))],
  };
});
function sliderValue(axis) {
  if (!panBounds.value) return 50;
  const size = axis === "x" ? dimensions.value.width : dimensions.value.height;
  const center = (size / 2 - viewport.value[axis]) / viewport.value.zoom;
  const [min, max] = panBounds.value[axis];
  return Math.max(0, Math.min(100, (center - min) / (max - min) * 100));
}
function slide(axis, event) {
  if (!panBounds.value) return;
  const [min, max] = panBounds.value[axis];
  const size = axis === "x" ? dimensions.value.width : dimensions.value.height;
  const center = min + Number(event.target.value) / 100 * (max - min);
  setViewport({ ...viewport.value, [axis]: size / 2 - center * viewport.value.zoom });
}
const nodes = computed(() =>
  renderedGraph.value.nodes.map((n) => ({
    id: n.id,
    type: n.type === "JUNCTION" ? "junction" : isGroupingNode(n) ? "groupHeading" : "chart",
    position: { ...n.position },
    style: { width: n.width + "px", height: n.height + "px" },
    selected: props.selectedIds.length ? props.selectedIds.includes(n.id) : n.id === props.selectedId,
    data: {
      node: n,
      editable: props.editable,
      sliding: n.id === slideId.value,
      showNames: props.showNames,
      highlight: n.id === props.highlight || props.highlightIds.includes(n.id),
      hasChildren: parentIds.value.has(n.id),
      teamCount: teamCounts.value.get(n.id) || 0,
      collapsed: props.collapsed.has(n.id),
      toggle: (id) => emit("toggle", id),
    },
  })),
);
const edges = computed(() =>
  renderedGraph.value.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.style?.sourceHandle || "source-bottom",
    targetHandle: (e.style?.targetHandle || "target-top").replace("target-", "source-"),
    type: e.layoutPath && !isDragging.value && !preview.value ? "compact" : "smoothstep",
    data: { layoutPath: e.layoutPath },
    updatable: props.editable,
    style: {
      stroke: e.style?.color || "#94a3b8",
      strokeWidth: e.style?.width || 1.5,
      strokeDasharray: e.style?.lineType === "dashed" ? "6 4" : undefined,
    },
  })),
);
function clickNode({ node, event }) {
  if (Date.now() < ignoreClickUntil) return;
  slideId.value = null;
  emit("select", node.id, !!(event.ctrlKey || event.metaKey));
}
function enableSlide({ node }) {
  if (!props.editable || node.data.node.type === "JUNCTION") return;
  slideId.value = node.id;
  emit("select", node.id);
}
function startDrag({ node }) {
  isDragging.value = true;
  const ids = props.selectedIds.includes(node.id) ? props.selectedIds : [node.id];
  if (!props.selectedIds.includes(node.id)) emit("select", node.id);
  const sliding = ids.length === 1 && slideId.value === node.id;
  dragState = { graph: props.graph, sliding, ids, origin: { ...props.graph.nodes.find((item) => item.id === node.id).position } };
  if (sliding) preview.value = anchorOutgoingLines(props.graph, node.id);
}
function dragNode({ node }) {
  if (dragState?.ids.length > 1) {
    const dx = node.position.x - dragState.origin.x, dy = node.position.y - dragState.origin.y;
    applyNodeChanges(dragState.graph.nodes.filter((item) => dragState.ids.includes(item.id)).map((item) => ({
      id: item.id, type: "position", position: { x: item.position.x + dx, y: item.position.y + dy }, dragging: true,
    })));
    return;
  }
  if (!dragState?.sliding) return;
  const position = slidePosition(dragState.graph, node.id, node.position);
  applyNodeChanges([{ id: node.id, type: "position", position, dragging: true }]);
}
function stopDrag({ node }) {
  const sliding = !!dragState?.sliding;
  const position = sliding ? slidePosition(dragState.graph, node.id, node.position) : { ...node.position };
  ignoreClickUntil = Date.now() + 150;
  if (dragState?.ids.length > 1) {
    const dx = node.position.x - dragState.origin.x, dy = node.position.y - dragState.origin.y;
    emit("move-many", dragState.graph.nodes.filter((item) => dragState.ids.includes(item.id)).map((item) => ({
      id: item.id, position: { x: item.position.x + dx, y: item.position.y + dy },
    })));
  } else emit("move", node.id, position, sliding);
  preview.value = null;
  dragState = null;
  isDragging.value = false;
}
watch(() => props.selectedId, (id) => { if (id !== slideId.value) slideId.value = null; });
watch(() => props.graph, () => {
  if (!props.graph.nodes.some((node) => node.id === slideId.value)) slideId.value = null;
});
function fit() {
  nextTick(() => fitView({ padding: 0.15, duration: 250, maxZoom: 1 }));
}
function connectionLocation(event,path) {
  const pointer = event.touches?.[0] || event;
  const matrix = path.getScreenCTM(), length = path.getTotalLength();
  if (!matrix || !length) return;
  let closest = 0, distance = Infinity;
  // Snap to the rendered line, including its bends and vertical sections.
  for (let i = 0; i <= 200; i++) {
    const at = length * i / 200;
    const point = path.getPointAtLength(at).matrixTransform(matrix);
    const d = Math.hypot(point.x - pointer.clientX, point.y - pointer.clientY);
    if (d < distance) { closest = at; distance = d; }
  }
  const point = path.getPointAtLength(closest).matrixTransform(matrix);
  const before = path.getPointAtLength(Math.max(0, closest - 1));
  const after = path.getPointAtLength(Math.min(length, closest + 1));
  const dx = after.x - before.x, dy = after.y - before.y;
  return {position:screenToFlowCoordinate({x:point.x,y:point.y}),direction:Math.abs(dx)>Math.abs(dy) ? dx>0 ? 'right':'left':dy>0 ? 'down':'up'};
}
function splitConnection({event,edge}) {
  if(!props.editable || Date.now()<ignoreClickUntil) return;
  const path=event.target.closest('.vue-flow__edge')?.querySelector('.vue-flow__edge-path');
  const at=path && connectionLocation(event,path);
  if(at) emit('split-edge',edge.id,at.position,at.direction);
}
function center(node) {
  nextTick(() =>
    setCenter(
      node.position.x + node.width / 2,
      node.position.y + node.height / 2,
      { zoom: 1, duration: 350 },
    ),
  );
}
let initialized = false;
function initialView() {
  if (!props.graph.nodes.length) return;
  if (props.graph.nodes.length <= 12) {
    fit();
    return;
  }
  const children = new Map(),
    targets = new Set(props.graph.edges.map((e) => e.target));
  for (const e of props.graph.edges) {
    if (!children.has(e.source)) children.set(e.source, []);
    children.get(e.source).push(e.target);
  }
  const roots = props.graph.nodes.filter((n) => !targets.has(n.id));
  const size = (id) => {
    let count = 0;
    const queue = [id],
      seen = new Set();
    while (queue.length) {
      const next = queue.pop();
      if (seen.has(next)) continue;
      seen.add(next);
      count++;
      queue.push(...(children.get(next) || []));
    }
    return count;
  };
  const root =
    roots.sort((a, b) => size(b.id) - size(a.id))[0] || props.graph.nodes[0];
  nextTick(() =>
    setCenter(root.position.x + root.width / 2, root.position.y + 240, {
      zoom: 0.85,
      duration: 250,
    }),
  );
}
function ready() {
  if (!initialized) {
    initialized = true;
    initialView();
  }
}
function onChanges(changes) {
  applyNodeChanges(
    changes.filter((c) =>
      ["dimensions", "position", "select"].includes(c.type),
    ).map((change) => change.type === "select" && rectangleSelection
      ? { ...change, selected: rectangleSelection.has(change.id) } : change),
  );
}
watch(
  () => props.graph.nodes.length,
  (next, previous) => {
    if (!previous && next) fit();
  },
);
defineExpose({ fit, center, initialView });
</script>
<template>
  <div class="graph-canvas" :class="{ 'has-pan-sliders': showSliders, 'rectangle-selection-mode': rectangleMode, 'editable-lines': editable }"
    tabindex="0" @dblclick="toggleRectangle" @keydown.esc="rectangleMode = false" @pointerdown.capture="beginPointer">
    <VueFlow
      :id="id"
      :nodes="nodes"
      :edges="edges"
      :apply-default="false"
      :nodes-draggable="editable"
      :nodes-connectable="editable"
      :multi-selection-key-code="'Control'"
      :select-nodes-on-drag="false"
      :selection-key-code="editable && rectangleMode ? true : null"
      :pan-on-drag="!rectangleMode"
      :selection-mode="SelectionMode.Partial"
      :connection-mode="ConnectionMode.Loose"
      :edges-updatable="editable"
      :delete-key-code="null"
      :zoom-on-double-click="!editable"
      :min-zoom="0.01"
      :max-zoom="2"
      :only-render-visible-elements="true"
      @nodes-change="onChanges"
      @node-click="clickNode"
      @node-double-click="enableSlide"
      @edge-click="({ edge }) => { if(Date.now()>=ignoreClickUntil) emit('select-edge', edge.id); }"
      @edge-double-click="splitConnection"
      @pane-click="clickPane"
      @selection-end="finishRectangle"
      @node-drag-start="startDrag"
      @node-drag="dragNode"
      @node-drag-stop="stopDrag"
      @connect="(connection) => emit('connect', connection)"
      @edge-update="(value) => emit('reconnect', value)"
      @nodes-initialized="ready"
    >
      <template #node-chart="nodeProps"
        ><ChartCard v-bind="nodeProps"
      /></template>
      <template #node-junction="nodeProps"><JunctionNode v-bind="nodeProps" /></template>
      <template #node-groupHeading="nodeProps"><GroupHeading v-bind="nodeProps" /></template>
      <template #edge-compact="edgeProps"><CompactEdge v-bind="edgeProps" /></template>
    </VueFlow>
    <div class="canvas-view-controls">
      <button v-if="editable" @click="rectangleMode = !rectangleMode; slideId = null" :aria-pressed="rectangleMode"
        title="También puedes hacer doble clic en un espacio vacío para activar la selección rectangular">{{ rectangleMode ? 'Cancelar selección' : 'Seleccionar' }}</button>
      <button v-if="editable" @click="showHelp = !showHelp" :aria-expanded="showHelp" aria-controls="canvas-help-panel">Indicaciones</button>
      <button @click="showSliders = !showSliders" :aria-pressed="showSliders">{{ showSliders ? 'Ocultar deslizadores' : 'Deslizadores' }}</button>
    </div>
    <aside v-if="editable && showHelp" id="canvas-help-panel" class="canvas-help">
      <button class="canvas-help-close" @click="showHelp = false" aria-label="Cerrar indicaciones">×</button>
      <strong>Cómo editar el organigrama</strong>
      <p>Arrastra de un conector a otro para conectar. Una tarjeta puede recibir y sacar varias líneas.</p>
      <p>Un clic y arrastrar: mover la tarjeta con sus conexiones.</p>
      <p>Ctrl + clic: seleccionar o quitar varias tarjetas. Arrastra cualquiera de las seleccionadas para moverlas juntas.</p>
      <p>Ctrl+C copia la selección; Ctrl+V pega copias visuales de personal que no suman al contador. Supr elimina las tarjetas o la conexión seleccionada. Dentro de un campo, estos comandos editan el texto.</p>
      <p>Doble clic en un espacio vacío: dibujar un rectángulo para seleccionar varias tarjetas. Al terminar vuelve automáticamente la mano para mover la pizarra. Escape cancela este modo.</p>
      <p>Doble clic y arrastrar: deslizar sobre su eje manteniendo fijas las ramas inferiores. Un clic desactiva este modo.</p>
      <p>Arrastra un tramo de línea para ajustar su recorrido sin mover las tarjetas. Doble clic sobre una línea: crear un punto de unión.</p>
    </aside>
    <div v-if="rectangleMode" class="canvas-slide-status" role="status">Arrastra sobre el fondo para seleccionar tarjetas · Esc para cancelar</div>
    <div v-if="editable && slideId" class="canvas-slide-status" role="status">
      Deslizamiento activo · arrastra la tarjeta
      <button @click="slideId = null" aria-label="Desactivar deslizamiento">×</button>
    </div>
    <div v-if="showSliders && graph.nodes.length" class="canvas-pan-horizontal">
      <span aria-hidden="true">↔</span>
      <input type="range" min="0" max="100" step="0.1"
        :value="sliderValue('x')" @input="slide('x', $event)"
        aria-label="Mover organigrama horizontalmente" title="Mover a izquierda o derecha" />
    </div>
    <div v-if="showSliders && graph.nodes.length" class="canvas-pan-vertical">
      <span aria-hidden="true">↕</span>
      <input type="range" min="0" max="100" step="0.1"
        :value="sliderValue('y')" @input="slide('y', $event)"
        aria-label="Mover organigrama verticalmente" title="Mover arriba o abajo" />
    </div>
    <div class="canvas-navigation">
      <button @click="zoomOut()" aria-label="Alejar">−</button
      ><button @click="fit" title="Ajustar todo el contenido">Ajustar</button
      ><button @click="zoomIn()" aria-label="Acercar">+</button>
    </div>
    <div class="canvas-caption">
      {{ graph.nodes.length }} tarjetas · {{ graph.edges.length }} conexiones
    </div>
  </div>
</template>
