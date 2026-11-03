<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { api } from "../../services/api.js";
import { useCompanies } from "../../composables/useCompanies.js";
import { useEditor } from "../../composables/useEditor.js";
import { autoLayout, reflowVisibleGraph } from "../../services/layout.js";
import { graphAncestors, normalize, visibleGraph } from "../../../../shared/graph.js";
import GraphCanvas from "../../components/GraphCanvas.vue";
import NodeProperties from "../../components/NodeProperties.vue";
import { editorShortcut } from "../../services/editorShortcuts.js";
import { applyBrandTheme, AUTRISA_BLUE } from "../../../../shared/theme.js";
import { restoreCompactedPoint } from "../../services/compactLayout.js";
const { companies, companyId } = useCompanies(),
  editor = useEditor();
const { graph, selectedId, selectedIds, edgeId, selected, past, future } = editor;
const draft = ref(null),
  drafts = ref([]),
  versions = ref([]),
  savedName = ref(""),
  canvas = ref(null),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  dialog = ref(""),
  newName = ref(""),
  mode = ref("master"),
  versionId = ref(""),
  nodeType = ref("POSITION"),
  groupTitle = ref(""),
  employeeQuery = ref(""),
  employeeStatus = ref("ACTIVE"),
  employeeCompanyId = ref(""),
  people = ref([]),
  peopleTotal = ref(0),
  peopleOffset = ref(0),
  sync = ref([]),
  syncIds = ref([]),
  syncTitles = ref(false),
  chosenEdge = ref(null);
const locateQuery = ref(""), locateOpen = ref(false);
const locateResults = computed(() => {
  const query = normalize(locateQuery.value);
  return query ? graph.value.nodes.filter((node) =>
    node.type === "EMPLOYEE" &&
    normalize(`${node.title} ${node.subtitle} ${node.metadata?.dni || ""}`).includes(query),
  ) : [];
});
watch(() => draft.value?.id, () => {
  locateQuery.value = "";
  locateOpen.value = false;
});
function locateEmployee(node) {
  attempt(() => {
    const ancestors = graphAncestors(graph.value, node.id);
    if (graph.value.nodes.some((item) => ancestors.has(item.id) && item.collapsed)) {
      const expanded = { ...graph.value, nodes: graph.value.nodes.map((item) =>
        ancestors.has(item.id) ? { ...item, collapsed: false } : item,
      ) };
      editor.commit(expanded);
    }
    select(node.id);
    locateOpen.value = false;
    nextTick(() => canvas.value?.center(displayed.value.nodes.find((item) => item.id === node.id) || node));
  });
}
const company = computed(() =>
  companies.value.find((c) => c.id === companyId.value),
);
const chartId = computed(() => company.value?.chart_id);
const dirty = computed(
  () =>
    !!draft.value &&
    (editor.dirty.value || draft.value.name !== savedName.value),
);
const collapsed = computed(
  () => new Set(graph.value.nodes.filter((n) => n.collapsed).map((n) => n.id)),
);
const displayed = computed(() =>
  visibleGraph(reflowVisibleGraph(graph.value, {}, collapsed.value), {}, collapsed.value),
);
function attempt(fn) {
  error.value = "";
  try {
    return fn();
  } catch (e) {
    error.value = e.message;
  }
}
function allowLeave() {
  return (
    !dirty.value ||
    window.confirm("Hay cambios sin guardar. ¿Deseas descartarlos?")
  );
}
onBeforeRouteLeave(() => allowLeave());
function beforeUnload(event) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
function copySelection() {
  const count = editor.copySelection();
  if (count) notice.value = `${count} ${count === 1 ? 'elemento copiado' : 'elementos copiados'}. Ctrl+V pega copias visuales.`;
}
function pasteSelection() {
  attempt(() => {
    const nodes = editor.paste();
    if (!nodes.length) return;
    chosenEdge.value = null;
    notice.value = "Copias pegadas. Las copias de personal no suman en los contadores.";
    nextTick(() => canvas.value?.center(displayed.value.nodes.find((node) => node.id === nodes[0].id) || nodes[0]));
  });
}
function removeSelection() {
  attempt(() => editor.remove());
  chosenEdge.value = null;
}
function onEditorKey(event) {
  if (!draft.value || busy.value || dialog.value) return;
  const editingText = !!event.target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
  const action = editorShortcut(event, editingText);
  if (!action) return;
  if (action === "copy") {
    if (window.getSelection()?.toString() || (!selectedIds.value.size && !selectedId.value)) return;
    event.preventDefault();
    copySelection();
  } else if (action === "paste" && editor.clipboard.value) {
    event.preventDefault();
    pasteSelection();
  } else if (action === "remove" && (selectedIds.value.size || selectedId.value || edgeId.value)) {
    event.preventDefault();
    removeSelection();
  }
}
onMounted(() => {
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("keydown", onEditorKey);
});
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", beforeUnload);
  window.removeEventListener("keydown", onEditorKey);
  clearTimeout(searchTimer);
});
let reverting = false,
  request = 0,
  draftLoadRequest = 0;
watch(
  chartId,
  async (next, previous) => {
    if (reverting) {
      reverting = false;
      return;
    }
    if (previous && !allowLeave()) {
      reverting = true;
      companyId.value =
        companies.value.find((c) => c.chart_id === previous)?.id ||
        companyId.value;
      return;
    }
    const key = ++request;
    draftLoadRequest++;
    draft.value = null;
    editor.load({ nodes: [], edges: [] });
    drafts.value = [];
    versions.value = [];
    dialog.value = "";
    if (!next) return;
    busy.value = true;
    try {
      const [d, v] = await Promise.all([
        api(`/charts/${next}/drafts`),
        api(`/charts/${next}/versions`),
      ]);
      if (key !== request) return;
      drafts.value = d;
      versions.value = v;
      if (d.length) await openDraft(d[0].id, false);
    } catch (e) {
      error.value = e.message;
    } finally {
      if (key === request) busy.value = false;
    }
  },
  { immediate: true },
);
async function refreshLists() {
  const currentChart = chartId.value;
  const [nextDrafts, nextVersions] = await Promise.all([
    api(`/charts/${currentChart}/drafts`),
    api(`/charts/${currentChart}/versions`),
  ]);
  if (currentChart === chartId.value) {
    drafts.value = nextDrafts;
    versions.value = nextVersions;
  }
}
async function openDraft(id, guard = true, event = null) {
  if (guard && !allowLeave()) {
    if (event) event.target.value = draft.value?.id || "";
    return;
  }
  busy.value = true;
  error.value = "";
  const key = ++draftLoadRequest,
    currentChart = chartId.value;
  try {
    const value = await api(`/drafts/${id}`);
    if (key !== draftLoadRequest || currentChart !== chartId.value) return;
    draft.value = value;
    savedName.value = value.name;
    editor.load(applyBrandTheme(value));
    await nextTick();
    canvas.value?.initialView();
  } catch (e) {
    error.value = e.message;
  } finally {
    if (key === draftLoadRequest && currentChart === chartId.value)
      busy.value = false;
  }
}
function newDraft() {
  newName.value = `Organigrama ${company.value?.name || ""}`;
  mode.value = "master";
  versionId.value = versions.value[0]?.id || "";
  dialog.value = "new";
}
async function createDraft() {
  if (!allowLeave()) return;
  busy.value = true;
  error.value = "";
  const creatingMode = mode.value;
  try {
    const value = await api(`/charts/${chartId.value}/drafts`, {
      method: "POST",
      body: {
        name: newName.value,
        mode: mode.value,
        versionId: versionId.value,
      },
    });
    if (value.chart_id !== chartId.value) return;
    draft.value = value;
    savedName.value = value.name;
    editor.load(applyBrandTheme(value));
    if (creatingMode === "master") editor.commit(autoLayout(graph.value));
    dialog.value = "";
    await refreshLists();
    await nextTick();
    canvas.value?.initialView();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function save() {
  if (!draft.value) return;
  busy.value = true;
  error.value = "";
  const savingId = draft.value.id;
  const submittedGraph = JSON.stringify(graph.value);
  try {
    const value = await api(`/drafts/${draft.value.id}`, {
      method: "PUT",
      body: {
        name: draft.value.name,
        content_revision: draft.value.content_revision,
        ...graph.value,
      },
    });
    if (draft.value?.id !== savingId) return;
    draft.value = { ...value, name: draft.value.name };
    savedName.value = value.name;
    editor.saved.value = submittedGraph;
    notice.value = "Borrador guardado.";
    await refreshLists();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function publish() {
  if (dirty.value) {
    error.value = "Guarda los cambios antes de publicar.";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const v = await api(`/drafts/${draft.value.id}/publish`, {
      method: "POST",
      body: { content_revision: draft.value.content_revision },
    });
    notice.value = `Versión V${v.version_number} publicada. Ya está disponible en Organigrama.`;
    await refreshLists();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
function addManual(grouping = false) {
  const node = {
    id: crypto.randomUUID(),
    type: nodeType.value,
    employeeId: null,
    title: {
      GROUP: "Nuevo grupo",
      POSITION: "Puesto vacante",
      BUSINESS_LINE: "Línea de negocio",
      BRANCH: "Nueva sede",
      AREA: "Nueva área",
      CUSTOM: "Título personalizado",
    }[nodeType.value],
    subtitle: "",
    position: {
      x: 100 + (graph.value.nodes.length % 5) * 40,
      y: 100 + (graph.value.nodes.length % 5) * 40,
    },
    width: 252,
    height: grouping ? 60 : 110,
    style: {
      backgroundColor: grouping ? "#fbfcfd" : "#f3f3fa",
      textColor: grouping ? AUTRISA_BLUE : "#243247",
      borderColor: AUTRISA_BLUE,
      borderStyle: "solid",
      ...(grouping ? { textAlign: "center" } : {}),
    },
    collapsed: false,
    siblingOrder: graph.value.nodes.length,
    metadata: {
      autrisaTheme: 1,
      company: company.value?.name || "",
      businessLine: "",
      branch: "",
      area: "",
    },
  };
  if (grouping && groupTitle.value.trim()) node.title = groupTitle.value.trim();
  attempt(() => {
    editor.addNode(node);
    dialog.value = "";
    nextTick(() => canvas.value?.center(node));
  });
}
async function searchEmployees() {
  error.value = "";
  const key = ++searchRequest;
  try {
    const result = await api(
      `/employees?status=${employeeStatus.value}&companyId=${encodeURIComponent(employeeCompanyId.value)}&q=${encodeURIComponent(employeeQuery.value)}&limit=30&offset=${peopleOffset.value}`,
    );
    if (key === searchRequest) {
      people.value = result.items;
      peopleTotal.value = result.total;
    }
  } catch (e) {
    if (key === searchRequest) error.value = e.message;
  }
}
let searchTimer,
  searchRequest = 0;
watch([employeeQuery, employeeStatus, employeeCompanyId], () => {
  peopleOffset.value = 0;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchEmployees, 250);
});
function addEmployee(e) {
  const node = {
    id: crypto.randomUUID(),
    type: "EMPLOYEE",
    employeeId: e.id,
    title: e.full_name,
    subtitle: e.position_name,
    position: { x: 100, y: 100 },
    width: 252,
    height: 110,
    style: {
      backgroundColor: "#ffffff",
      textColor: "#243247",
      borderColor: AUTRISA_BLUE,
      borderStyle: e.employment_status === "CEASED" ? "dashed" : "solid",
    },
    collapsed: false,
    siblingOrder: graph.value.nodes.length,
    metadata: {
      company: e.company,
      businessLine: e.business_line,
      branch: e.branch,
      area: e.area,
      dni: e.dni,
      employmentStatus: e.employment_status,
      autrisaTheme: 1,
      hierarchyStatus: e.hierarchy_status || "EMPTY",
    },
  };
  attempt(() => {
    editor.addNode(node);
    notice.value = "Tarjeta incorporada.";
    nextTick(() => canvas.value?.center(node));
  });
}
function select(id, additive = false) {
  editor.selectNode(id, additive);
  chosenEdge.value = null;
}
function selectEdge(id) {
  editor.selectNode(null);
  edgeId.value = id;
  selectedId.value = null;
  chosenEdge.value = JSON.parse(
    JSON.stringify(graph.value.edges.find((e) => e.id === id)),
  );
}
function move(id, position, slide) {
  const original = graph.value.nodes.find((node) => node.id === id);
  const rendered = displayed.value.nodes.find((node) => node.id === id);
  const authored = original && rendered ? {
    x: position.x + original.position.x - rendered.position.x,
    y: position.y + original.position.y - rendered.position.y,
  } : position;
  attempt(() => editor.moveNode(id, authored, slide));
}
function toggle(id) {
  const n = graph.value.nodes.find((n) => n.id === id);
  attempt(() => editor.updateNode({ ...n, collapsed: !n.collapsed }));
}
function splitVisibleEdge(id, position, direction) {
  const authored = restoreCompactedPoint(graph.value, {}, collapsed.value, position);
  attempt(() => { editor.splitEdge(id, authored, direction); chosenEdge.value = null; });
}
function moveMany(moves) {
  const originals = new Map(graph.value.nodes.map((node) => [node.id, node]));
  const rendered = new Map(displayed.value.nodes.map((node) => [node.id, node]));
  attempt(() => editor.moveNodes(moves.map(({ id, position }) => ({ id, position: {
    x: position.x + originals.get(id).position.x - rendered.get(id).position.x,
    y: position.y + originals.get(id).position.y - rendered.get(id).position.y,
  } }))));
}
function layout(root = null) {
  attempt(() => {
    editor.commit(autoLayout(graph.value, root));
    nextTick(() => canvas.value?.fit());
  });
}
function applyEdge() {
  attempt(() => {
    const edges = graph.value.edges.map((e) =>
      e.id === chosenEdge.value.id ? chosenEdge.value : e,
    );
    editor.commit({ ...graph.value, edges });
  });
}
async function openSync() {
  busy.value = true;
  error.value = "";
  try {
    sync.value = await api(`/drafts/${draft.value.id}/sync-preview`);
    syncIds.value = [];
    syncTitles.value = false;
    dialog.value = "sync";
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
function applySync() {
  attempt(() => {
    const byId = new Map(
      sync.value
        .filter((s) => syncIds.value.includes(s.nodeId))
        .map((s) => [s.nodeId, s.employee]),
    );
    const nodes = graph.value.nodes.map((n) => {
      const e = byId.get(n.id);
      if (!e) return n;
      return {
        ...n,
        ...(syncTitles.value
          ? { title: e.full_name, subtitle: e.position_name }
          : {}),
        metadata: {
          ...n.metadata,
          company: e.company,
          businessLine: e.business_line,
          branch: e.branch,
          area: e.area,
          dni: e.dni,
          employmentStatus: e.employment_status,
          hierarchyStatus: e.hierarchy_status || "EMPTY",
        },
      };
    });
    editor.commit({ ...graph.value, nodes });
    dialog.value = "";
    notice.value =
      "Sincronización aplicada al borrador local. Guarda para persistir.";
  });
}
</script>
<template>
  <section class="chart-module">
    <div v-if="error" class="alert error" role="alert">{{ error }}</div>
    <div v-if="notice" class="alert success" role="status">
      {{ notice
      }}<button
        class="dismiss"
        @click="notice = ''"
        aria-label="Cerrar mensaje"
      >
        ×
      </button>
    </div>
    <div class="module-toolbar">
      <div class="toolbar-group">
        <span class="eyebrow">BORRADOR</span
        ><select
          aria-label="Seleccionar borrador"
          :value="draft?.id || ''"
          @change="openDraft($event.target.value, true, $event)"
          :disabled="busy || !drafts.length"
        >
          <option v-if="!drafts.length" value="">Sin borradores</option>
          <option v-for="d in drafts" :key="d.id" :value="d.id">
            {{ d.name }}
          </option></select
        ><span v-if="draft" class="badge" :class="{ warning: dirty }">{{
          dirty ? "Sin guardar" : "Guardado"
        }}</span>
      </div>
      <div class="toolbar-group">
        <button @click="newDraft" :disabled="!chartId || busy">+ Nuevo</button
        ><button @click="save" :disabled="!draft || busy">
          Guardar borrador</button
        ><button
          class="primary"
          @click="publish"
          :disabled="!draft || dirty || busy || !graph.nodes.length"
        >
          Publicar versión
        </button>
      </div>
    </div>
    <template v-if="draft">
      <div class="editor-tools">
        <div class="search-box editor-person-search" @keydown.esc="locateOpen = false">
          <input v-model="locateQuery" type="search"
            aria-label="Ubicar personal en Board" placeholder="Ubicar nombre, DNI o puesto…"
            @focus="locateOpen = true" @input="locateOpen = true"
            @keydown.enter.prevent="locateResults.length && locateEmployee(locateResults[0])" />
          <div v-if="locateQuery && locateOpen" class="search-results">
            <button v-for="node in locateResults" :key="node.id" @click="locateEmployee(node)">
              <strong>{{ node.title }}</strong>
              <small>{{ node.metadata?.dni || 'Sin DNI' }} · {{ node.subtitle }}</small>
              <small>{{ node.metadata?.branch }} · Tarjeta {{ node.id.slice(0, 8) }}</small>
            </button>
            <p v-if="!locateResults.length">No hay trabajadores con esos datos en este borrador.</p>
            <small>Selecciona para centrar y editar. Las ramas necesarias se expandirán.</small>
          </div>
        </div>
        <input
          class="draft-name"
          v-model="draft.name"
          maxlength="200"
          aria-label="Nombre del borrador"
        /><button @click="nodeType = 'POSITION'; dialog = 'manual'">+ Tarjeta</button>
        <button @click="nodeType = 'BUSINESS_LINE'; groupTitle = ''; dialog = 'grouping'">+ Agrupador</button
        ><button
          @click="
            dialog = 'employees';
            searchEmployees();
          "
        >
          + Empleado</button
        ><button @click="layout()">Distribuir</button
        ><button
          @click="attempt(editor.undo)"
          :disabled="!past.length"
          title="Deshacer"
        >
          ↶</button
        ><button
          @click="attempt(editor.redo)"
          :disabled="!future.length"
          title="Rehacer"
        >
          ↷</button
        ><button @click="openSync" :disabled="busy">Sincronizar datos</button>
      </div>
      <div class="editor-workspace">
        <GraphCanvas
          ref="canvas"
          :graph="displayed"
          :hierarchy-graph="graph"
          editable
          :collapsed="collapsed"
          :selected-id="selectedId"
          :selected-ids="[...selectedIds]"
          @select="select"
          @select-many="(ids) => { editor.selectNodes(ids); chosenEdge = null; }"
          @select-edge="selectEdge"
          @move="move"
          @move-many="moveMany"
          @toggle="toggle"
          @split-edge="splitVisibleEdge"
          @connect="(c) => attempt(() => editor.connect(c))"
          @reconnect="
            (v) => attempt(() => editor.connect(v.connection, v.edge.id))
          "
        />
        <aside v-if="selectedIds.size > 1" class="properties-panel">
          <h3>{{ selectedIds.size }} elementos seleccionados</h3>
          <p class="muted small">Arrastra cualquiera para moverlos juntos. Ctrl + clic añade o quita una tarjeta. También puedes seleccionar dibujando un rectángulo tras hacer doble clic en el fondo.</p>
          <button class="full-width" @click="select(null)">Quitar selección</button>
          <button class="full-width" @click="copySelection">Copiar selección · Ctrl+C</button>
          <button class="full-width" @click="pasteSelection" :disabled="!editor.clipboard.value">Pegar copias visuales · Ctrl+V</button>
          <button class="danger full-width" @click="removeSelection">Eliminar selección · Supr</button>
        </aside>
        <NodeProperties
          :node="selected"
          @save="(n) => attempt(() => editor.updateNode(n))"
          @duplicate="attempt(editor.duplicate)"
          @remove="attempt(editor.remove)"
          @layout="layout(selectedId)"
        />
        <aside v-if="chosenEdge && !selected" class="properties-panel">
          <h3>Conexión visual</h3>
          <p class="muted small">Haz doble clic en la línea para insertar un punto de unión.</p>
          <label>Salida<select :value="chosenEdge.style.sourceHandle || 'source-bottom'" @change="chosenEdge.style.sourceHandle = $event.target.value">
            <option value="source-bottom">Inferior</option><option value="source-top">Superior</option>
            <option value="source-left">Lateral izquierdo</option><option value="source-right">Lateral derecho</option>
          </select></label>
          <label>Entrada<select :value="chosenEdge.style.targetHandle || 'target-top'" @change="chosenEdge.style.targetHandle = $event.target.value">
            <option value="target-top">Superior</option><option value="target-bottom">Inferior</option>
            <option value="target-left">Lateral izquierdo</option><option value="target-right">Lateral derecho</option>
          </select></label>
          <label
            >Padre<select v-model="chosenEdge.source">
              <option v-for="n in graph.nodes" :key="n.id" :value="n.id">
                {{ n.title }}
              </option>
            </select></label
          ><label
            >Subordinado<select v-model="chosenEdge.target">
              <option v-for="n in graph.nodes" :key="n.id" :value="n.id">
                {{ n.title }}
              </option>
            </select></label
          ><label
            >Color<input type="color" v-model="chosenEdge.style.color" /></label
          ><label
            >Grosor<input
              type="number"
              min="1"
              max="10"
              step="0.5"
              v-model.number="chosenEdge.style.width" /></label
          ><label
            >Línea<select v-model="chosenEdge.style.lineType">
              <option value="solid">Continua</option>
              <option value="dashed">Discontinua</option>
            </select></label
          ><button class="primary full-width" @click="applyEdge">
            Aplicar conexión</button
          ><button
            class="danger full-width"
            @click="
              attempt(editor.remove);
              chosenEdge = null;
            "
          >
            Desconectar
          </button>
        </aside>
      </div>
    </template>
    <div v-else class="empty-state">
      <div class="empty-symbol">◇</div>
      <h2>
        {{
          busy ? "Cargando organigrama…" : "Un espacio para organizar tu equipo"
        }}
      </h2>
      <p>
        {{
          chartId
            ? "Crea un borrador desde la base de personal, una versión publicada o un lienzo vacío."
            : "Importa la base de personal para empezar a crear organigramas."
        }}
      </p>
      <button v-if="chartId" class="primary" @click="newDraft" :disabled="busy">
        Crear organigrama</button
      ><RouterLink v-else to="/upload" class="button primary"
        >Ir a Upload</RouterLink
      >
    </div>
    <div v-if="dialog" class="modal-backdrop" @click.self="dialog = ''">
      <section
        class="modal"
        role="dialog"
        aria-modal="true"
        :aria-label="
          dialog === 'employees' ? 'Buscar empleados' : 'Configurar borrador'
        "
      >
        <button class="modal-close" aria-label="Cerrar" @click="dialog = ''">
          ×
        </button>
        <form v-if="dialog === 'new'" @submit.prevent="createDraft">
          <h2>Nuevo borrador</h2>
          <p>Elige un punto de partida para {{ company?.name }}.</p>
          <label
            >Nombre<input v-model="newName" maxlength="200" required /></label
          ><label
            >Origen<select v-model="mode">
              <option value="master">
                Jerarquía maestra de empleados activos
              </option>
              <option value="empty">Lienzo vacío</option>
              <option value="version" :disabled="!versions.length">
                Versión publicada
              </option>
            </select></label
          ><label v-if="mode === 'version'"
            >Versión<select v-model="versionId" required>
              <option v-for="v in versions" :key="v.id" :value="v.id">
                V{{ v.version_number }}
              </option>
            </select></label
          ><button class="primary full-width" :disabled="busy">
            Crear borrador
          </button>
        </form>
        <form v-if="dialog === 'manual'" @submit.prevent="addManual(false)">
          <h2>Agregar tarjeta</h2>
          <label
            >Tipo<select v-model="nodeType">
              <option value="POSITION">Puesto / vacante</option>
            </select></label>
          <p>Una vacante no representa personal de la base y no se incluye en los contadores.</p>
          <button class="primary full-width">Crear tarjeta</button>
        </form>
        <form v-if="dialog === 'grouping'" @submit.prevent="addManual(true)">
          <h2>Crear agrupador</h2>
          <p>Encabezado con línea y control para mostrar u ocultar su contenido. Conéctalo con las tarjetas que agrupa.</p>
          <label>Tipo<select v-model="nodeType">
              <option value="BUSINESS_LINE">Línea de negocio</option>
              <option value="BRANCH">Sede</option>
              <option value="AREA">Área</option>
              <option value="GROUP">Grupo o división</option>
              <option value="CUSTOM">Título personalizado</option>
            </select></label
          ><label>Título<input v-model="groupTitle" maxlength="500" placeholder="Por ejemplo: AREQUIPA, ITV o SEDES" required /></label>
          <button class="primary full-width">Crear agrupador</button>
        </form>
        <template v-if="dialog === 'employees'"
          ><h2>Incorporar empleado</h2>
          <p>Selecciona la empresa de origen. Puedes incorporar personal de otra empresa a este organigrama.</p>
          <label for="employee-company">Empresa de origen</label>
          <select id="employee-company" v-model="employeeCompanyId">
            <option value="">Todas las empresas</option>
            <option v-for="company in companies" :key="company.id" :value="company.id">{{ company.name }}</option>
          </select>
          <input
            v-model="employeeQuery"
            aria-label="Buscar empleados"
            placeholder="Nombre, DNI o puesto"
          /><select v-model="employeeStatus" aria-label="Estado del empleado">
            <option value="ACTIVE">Activos</option>
            <option value="CEASED">Cesados</option>
            <option value="ABSENT">Ausentes de la última base</option>
          </select>
          <div class="people-list">
            <div v-for="e in people" :key="e.id">
              <div>
                <strong>{{ e.full_name }}</strong
                ><small>{{ e.position_name }} · {{ e.company }}</small
                ><small
                  >{{ e.dni || "Sin documento" }} ·
                  {{ e.employment_status }}</small
                >
              </div>
              <button @click="addEmployee(e)">Agregar</button>
            </div>
            <p v-if="!people.length">No hay resultados.</p>
          </div>
          <div class="pagination">
            <button
              :disabled="!peopleOffset"
              @click="
                peopleOffset -= 30;
                searchEmployees();
              "
            >
              Anterior</button
            ><span>{{ peopleTotal }} resultados</span
            ><button
              :disabled="peopleOffset + 30 >= peopleTotal"
              @click="
                peopleOffset += 30;
                searchEmployees();
              "
            >
              Siguiente
            </button>
          </div></template
        >
        <template v-if="dialog === 'sync'"
          ><h2>Sincronizar datos maestros</h2>
          <p>
            Selecciona qué tarjetas actualizar. Las posiciones, estilos y
            conexiones se conservan.
          </p>
          <p v-if="!sync.length">
            No hay diferencias con los datos maestros guardados.
          </p>
          <div class="people-list">
            <label v-for="s in sync" :key="s.nodeId" class="sync-row"
              ><input
                type="checkbox"
                :value="s.nodeId"
                v-model="syncIds"
              /><span
                ><strong>{{ s.currentTitle }}</strong
                ><small>Actual: {{ s.currentSubtitle }}</small
                ><small
                  >Base: {{ s.employee.full_name }} ·
                  {{ s.employee.position_name }}</small
                ><small
                  >{{ s.employee.company }} · {{ s.employee.branch }} ·
                  {{ s.employee.employment_status }}</small
                ></span
              ></label
            >
          </div>
          <label class="check-line"
            ><input type="checkbox" v-model="syncTitles" />Actualizar también
            título y subtítulo de las tarjetas seleccionadas (reemplaza su texto
            personalizado).</label
          ><button
            class="primary full-width"
            :disabled="!syncIds.length"
            @click="applySync"
          >
            Aplicar a {{ syncIds.length }} tarjetas
          </button></template
        >
      </section>
    </div>
  </section>
</template>
