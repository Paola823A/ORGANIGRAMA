<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useCompanies } from "../../composables/useCompanies.js";
import { api } from "../../services/api.js";
import { compactJunctions, countPeople, graphAncestors, normalize, visibleGraph } from "../../../../shared/graph.js";
import { exportGraph } from "../../services/export.js";
import { reflowVisibleGraph } from "../../services/layout.js";
import { applyBrandTheme } from "../../../../shared/theme.js";
import GraphCanvas from "../../components/GraphCanvas.vue";
import {boardOptions,positionGroup} from '../../services/boardFilters.js';
import { useAuth } from "../../composables/useAuth.js";
const { can } = useAuth();
const positionFilter=ref('');
const matchingPositions=computed(()=>positionFilter.value ? displayed.value.nodes.filter(n=>n.type==='EMPLOYEE' && positionGroup(n.subtitle)===positionFilter.value).map(n=>n.id):[]);
const { companyId, companies } = useCompanies(),
  router = useRouter(),
  versions = ref([]),
  versionId = ref(""),
  version = ref(null),
  graph = ref({ nodes: [], edges: [] }),
  filters = ref({ businessLine: "", branch: "", area: "" }),
  collapsed = ref(new Set()),
  autoReflow = ref(false),
  showNames = ref(true),
  query = ref(""),
  highlight = ref(null),
  canvas = ref(null),
  busy = ref(false),
  exporting = ref(false),
  error = ref(""),
  progress = ref(""),
  searchOpen = ref(false);
const company = computed(() =>
    companies.value.find((c) => c.id === companyId.value),
  ),
  chartId = computed(() => company.value?.chart_id);
const hierarchy = computed(() => visibleGraph(graph.value, filters.value));
const displayed = computed(() => {
  const source = autoReflow.value || collapsed.value.size
    ? reflowVisibleGraph(graph.value, filters.value, collapsed.value) : graph.value;
  return visibleGraph(source, filters.value, collapsed.value);
});
const peopleCount = computed(() => countPeople(displayed.value));
const results = computed(() => {
  const q = normalize(query.value);
  return q
    ? graph.value.nodes
        .filter(
          (n) =>
            n.type === "EMPLOYEE" &&
            normalize(`${n.title} ${n.subtitle} ${n.metadata.dni}`).includes(q),
        )
        .slice(0, 40)
    : [];
});
const filterOptions=computed(()=>boardOptions(graph.value.nodes,filters.value));
let request = 0,
  versionRequest = 0,
  timer;
watch(
  chartId,
  async (id) => {
    const key = ++request;
    versionRequest++;
    versions.value = [];
    versionId.value = "";
    version.value = null;
    graph.value = { nodes: [], edges: [] };
    error.value = "";
    if (!id) return;
    busy.value = true;
    try {
      const data = await api(`/charts/${id}/versions`);
      if (key !== request) return;
      versions.value = data;
      if (data.length) versionId.value = data[0].id;
    } catch (e) {
      if (key === request) error.value = e.message;
    } finally {
      if (key === request) busy.value = false;
    }
  },
  { immediate: true },
);
watch(versionId, async (id) => {
  if (!id) return;
  const key = ++versionRequest,
    currentChart = chartId.value;
  busy.value = true;
  error.value = "";
  try {
    const value = await api(`/charts/${currentChart}/versions/${id}`);
    if (key !== versionRequest || currentChart !== chartId.value) return;
    version.value = value;
    graph.value = applyBrandTheme(compactJunctions(value.snapshot),company.value?.name);
    reset();
    await nextTick();
    canvas.value?.initialView();
  } catch (e) {
    if (key === versionRequest) error.value = e.message;
  } finally {
    if (key === versionRequest) busy.value = false;
  }
});
function reset() {
  autoReflow.value = false;
  filters.value = { businessLine: "", branch: "", area: "" };
  collapsed.value = new Set(
    graph.value.nodes.filter((n) => n.collapsed).map((n) => n.id),
  );
  showNames.value = true;
  query.value = "";
  searchOpen.value = false;
  highlight.value = null;
  nextTick(() => canvas.value?.fit());
}
function toggle(id) {
  const copy = new Set(collapsed.value);
  copy.has(id) ? copy.delete(id) : copy.add(id);
  collapsed.value = copy;
  autoReflow.value = true;
}
function locate(node) {
  filters.value = { businessLine: "", branch: "", area: "" };
  const copy = new Set(collapsed.value);
  for (const id of graphAncestors(graph.value, node.id)) copy.delete(id);
  collapsed.value = copy;
  highlight.value = node.id;
  searchOpen.value = false;
  nextTick(() => canvas.value?.center(displayed.value.nodes.find((item) => item.id === node.id) || node));
  clearTimeout(timer);
  timer = setTimeout(() => (highlight.value = null), 3500);
}
async function download(format) {
  exporting.value = true;
  error.value = "";
  progress.value = "Preparando exportación…";
  try {
    await exportGraph(displayed.value, {
      format,
      company: company.value.name,
      version: version.value.version_number,
      showNames: showNames.value,
      hierarchy: hierarchy.value,
      collapsed: collapsed.value,
      onProgress: (page, total) =>
        (progress.value = `Exportando página ${page} de ${total}…`),
    });
  } catch (e) {
    error.value = `No se pudo exportar. ${e.message}`;
  } finally {
    exporting.value = false;
    progress.value = "";
  }
}
async function deleteVersion() {
  const selected=version.value,currentChart=chartId.value;
  if(!selected || selected.id===versions.value[0]?.id || busy.value) return;
  if(!window.confirm(`¿Eliminar la versión V${selected.version_number}? Los borradores se conservan.`)) return;
  busy.value=true;error.value='';
  try {
    await api(`/charts/${currentChart}/versions/${selected.id}`,{method:'DELETE'});
    if(chartId.value!==currentChart) return;
    versions.value=await api(`/charts/${currentChart}/versions`);
    versionId.value=versions.value[0]?.id || '';
  } catch(e) {error.value=e.message;} finally{busy.value=false;}
}
async function continueEditing() {
  busy.value = true;
  error.value = "";
  try {
    await api(
      `/charts/${chartId.value}/versions/${versionId.value}/create-draft`,
      {
        method: "POST",
        body: { name: `Desde V${version.value.version_number}` },
      },
    );
    await router.push("/canva");
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
onBeforeUnmount(() => clearTimeout(timer));
function date(value) {
  return new Date(value.replace(" ", "T") + "Z").toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
</script>
<template>
  <section class="chart-module">
    <div v-if="error" class="alert error" role="alert">{{ error }}</div>
    <div class="module-toolbar">
      <div class="toolbar-group">
        <span class="eyebrow">VERSIÓN PUBLICADA</span
        ><select
          aria-label="Versión publicada"
          v-model="versionId"
          :disabled="busy || !versions.length"
        >
          <option v-if="!versions.length" value="">
            Sin versiones publicadas
          </option>
          <option v-for="v in versions" :key="v.id" :value="v.id">
            V{{ v.version_number }} · {{ date(v.published_at) }}
          </option></select
        ><span v-if="version" class="badge success">Solo lectura</span>
        <button v-if="can('board',companyId)" class="danger" @click="deleteVersion" :disabled="busy || !version || versionId===versions[0]?.id" title="Elimina una versión pasada. Se conserva la más reciente.">Eliminar versión</button>
      </div>
      <div class="toolbar-group">
        <button
          v-if="can('board',companyId)"
          @click="continueEditing"
          :disabled="!version || busy || exporting"
        >
          Crear borrador
        </button>
        <details class="export-menu">
          <summary :class="{ disabled: !version || exporting }">
            ↧ Exportar
          </summary>
          <div>
            <button
              v-for="format in ['png', 'jpeg', 'pdf']"
              :key="format"
              :disabled="!version || exporting || !displayed.nodes.length"
              @click="download(format)"
            >
              {{ format.toUpperCase()
              }}{{ format === "pdf" ? " · multipágina si es necesario" : "" }}
            </button>
          </div>
        </details>
      </div>
    </div>
    <template v-if="version">
      <div class="graphic-tools">
        <div class="search-box">
          <input
            v-model="query"
            @focus="searchOpen = true"
            @input="searchOpen = true"
            placeholder="Buscar nombre, DNI o puesto…"
            aria-label="Buscar trabajador"
          />
          <div v-if="query && searchOpen" class="search-results">
            <button v-for="n in results" :key="n.id" @click="locate(n)">
              <strong>{{ showNames ? n.title : n.subtitle }}</strong
              ><small>{{ n.metadata.dni }} · {{ n.subtitle }}</small
              ><small>Tarjeta {{ n.id.slice(0, 8) }}</small>
            </button>
            <p v-if="!results.length">No hay coincidencias.</p>
            <small
              >Hasta 40 resultados. Localizar restablece los filtros.</small
            >
          </div>
        </div>
        <select
          v-for="[key, label] in [
            ['businessLine', 'Giros'],
            ['branch', 'Sedes'],
            ['area', 'Áreas'],
          ]"
          :key="key"
          v-model="filters[key]"
          :aria-label="label"
          @change="nextTick(() => canvas?.fit())"
        >
          <option value="">{{ label }} · todos</option>
          <option
            v-for="value in filterOptions[key]"
            :key="value"
            :value="value"
          >
            {{ value }}
          </option></select>
        <div class="people-counter" role="status" aria-live="polite" aria-atomic="true"
          title="Personas únicas en las tarjetas visibles, incluidos los jefes de contexto. Las ramas contraídas no se cuentan.">
          <strong>{{ peopleCount }}</strong>
          <span>{{ peopleCount === 1 ? "Persona visible" : "Personas visibles" }}</span>
        </div>
        <select v-model="positionFilter" aria-label="Puesto"><option value="">Puesto · todos</option><option v-for="value in filterOptions.position" :key="value" :value="value">{{ value }}</option></select>
        <label class="check-line"
          ><input type="checkbox" v-model="showNames" />Nombres</label
        ><button
          @click="
            collapsed = new Set();
            autoReflow = true;
            nextTick(() => canvas?.fit());
          "
        >
          Expandir todo</button
        ><button @click="reset">Restablecer</button>
      </div>
      <div v-if="exporting" class="export-progress" role="status">
        {{ progress }}
      </div>
      <div class="graphic-workspace">
        <GraphCanvas
          ref="canvas"
          :graph="displayed"
          :hierarchy-graph="hierarchy"
          :show-names="showNames" :highlight-ids="matchingPositions"
          :collapsed="collapsed"
          :highlight="highlight"
          @toggle="toggle"
        />
        <div v-if="!displayed.nodes.length" class="canvas-empty">
          No hay tarjetas que cumplan estos filtros.
        </div>
      </div>
      <footer class="graphic-footer">
        <span
          ><span class="status-dot"></span>{{ company?.name }} · V{{
            version.version_number
          }}
          · {{ graph.name }}</span
        ><span>Publicado el {{ date(version.published_at) }}</span>
      </footer>
    </template>
    <div v-else class="empty-state">
      <div class="empty-symbol">▦</div>
      <h2>
        {{ busy ? "Cargando versiones…" : "La organización, en perspectiva" }}
      </h2>
      <p>
        {{
          chartId
            ? "Las versiones publicadas aparecerán aquí. Crea y publica tu primer organigrama desde Board."
            : "Empieza importando la base de personal de tu organización."
        }}
      </p>
      <RouterLink v-if="can(chartId ? 'board' : 'upload',companyId)" :to="chartId ? '/canva' : '/upload'" class="button primary">{{
        chartId ? "Abrir Board" : "Importar base de personal"
      }}</RouterLink>
      <div class="empty-features">
        <span>Jerarquías claras</span><span>Versiones preservadas</span
        ><span>Exportación completa</span>
      </div>
    </div>
  </section>
</template>
