<script setup>
import { computed, onMounted, ref } from "vue";
import { api } from "../../services/api.js";
import { useCompanies } from "../../composables/useCompanies.js";
import { useAuth } from "../../composables/useAuth.js";
const { user,localMode } = useAuth();
const { refreshCompanies } = useCompanies();
const preview = ref(null),
  history = ref([]),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  repeated = ref(false),
  conflicts = ref(false),
  issues = ref([]),
  query = ref(""),
  source = ref("ALL"),
  page = ref(0);
const filtered = computed(() =>
  (preview.value?.records || []).filter(
    (r) =>
      (source.value === "ALL" || r.status === source.value) &&
      `${r.dni} ${r.fullName} ${r.company}`
        .toLocaleLowerCase()
        .includes(query.value.toLocaleLowerCase()),
  ),
);
const rows = computed(() =>
  filtered.value.slice(page.value * 30, page.value * 30 + 30),
);
async function refreshHistory() {
  history.value = await api("/imports");
}
async function selectFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  error.value = "";
  notice.value = "";
  preview.value = null;
  issues.value = [];
  busy.value = true;
  page.value = 0;
  repeated.value = false;
  conflicts.value = false;
  try {
    if (!/\.xlsm$/i.test(file.name))
      throw new Error("Selecciona un archivo XLSM.");
    if (file.size > 12 * 1024 * 1024)
      throw new Error("El límite de archivo es 12 MB.");
    const body = new FormData();
    body.append("file", file);
    preview.value = await api("/imports/preview", { method: "POST", body });
    issues.value = preview.value.issues;
  } catch (e) {
    error.value = e.message;
    await refreshHistory().catch(() => {});
  } finally {
    busy.value = false;
    event.target.value = "";
  }
}
async function confirmImport() {
  busy.value = true;
  error.value = "";
  try {
    const result = await api("/imports/confirm", {
      method: "POST",
      body: {
        token: preview.value.token,
        allowRepeated: repeated.value,
        preserveConflicts: conflicts.value,
      },
    });
    notice.value = `Importación completada: ${result.summary.inserted} registros insertados y ${result.summary.updated} actualizados.`;
    preview.value = null;
    await Promise.all([refreshHistory(), refreshCompanies()]);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function showIssues(id) {
  try {
    issues.value = await api(`/imports/${id}/issues`);
  } catch (e) {
    error.value = e.message;
  }
}
async function removeHistory(batch) {
  if(busy.value || !window.confirm(`¿Quitar ${batch.filename} del historial? El personal importado y los organigramas se conservarán.`)) return;
  busy.value=true;error.value='';
  try {await api(`/imports/${batch.id}`,{method:'DELETE'});await refreshHistory();notice.value='Registro eliminado del historial.';}
  catch(e){error.value=e.message;}finally{busy.value=false;}
}
onMounted(() => refreshHistory().catch((e) => (error.value = e.message)));
function date(value) {
  return new Date(value.replace(" ", "T") + "Z").toLocaleString("es-PE");
}
</script>
<template>
  <section class="upload-page">
    <div class="section-heading">
      <div>
        <h2>Una base, toda tu organización</h2>
        <p>
          Revisa los datos antes de actualizar el personal y sus responsables.
        </p>
      </div>
      <span class="badge">XLSM · hasta 12 MB</span>
    </div>
    <div class="alert error" v-if="error" role="alert">
      <strong>Error bloqueante.</strong> {{ error }}
    </div>
    <div class="alert success" v-if="notice" role="status">{{ notice }}</div>
    <p v-if="!localMode && user?.role !== 'OWNER'">Solo se importará el personal de las empresas para las que el creador te autorizó Upload. Las demás empresas del archivo no se modificarán.</p>
    <label class="upload-zone" :class="{ disabled: busy }"
      ><span class="upload-symbol">↥</span
      ><strong>{{
        busy ? "Procesando archivo…" : "Seleccionar base de personal"
      }}</strong
      ><span>Hoja principal y CESADOS · Las macros no se ejecutan</span
      ><input type="file" accept=".xlsm" :disabled="busy" @change="selectFile"
    /></label>
    <template v-if="preview">
      <div class="section-heading">
        <div>
          <h3>Vista previa de importación</h3>
          <p>
            {{ preview.filename }} ·
            {{ (preview.size / 1024 / 1024).toFixed(2) }} MB
          </p>
        </div>
        <span class="badge">Pendiente de confirmar</span>
      </div>
      <div class="stats-grid">
        <div
          v-for="[key, label] in [
            ['active', 'Activos'],
            ['ceased', 'Cesados'],
            ['inserted', 'Nuevos'],
            ['updated', 'Actualizados'],
            ['changed', 'Con cambios'],
            ['absent', 'Ausentes'],
            ['duplicateRows', 'Filas duplicadas'],
            ['unresolved', 'Jefaturas sin resolver'],
          ]"
          :key="key"
          class="stat"
        >
          <strong>{{ preview.summary[key] }}</strong
          ><span>{{ label }}</span>
        </div>
      </div>
      <div class="table-tools">
        <input
          aria-label="Buscar en vista previa"
          v-model="query"
          placeholder="Buscar por nombre, DNI o empresa"
          @input="page = 0"
        /><select
          aria-label="Origen de registros"
          v-model="source"
          @change="page = 0"
        >
          <option value="ALL">Todos los registros</option>
          <option value="ACTIVE">Hoja principal</option>
          <option value="CEASED">CESADOS</option></select
        ><span>{{ filtered.length }} registros</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fila</th>
              <th>DNI</th>
              <th>Trabajador</th>
              <th>Empresa / puesto</th>
              <th>Estado / jefatura</th>
              <th>Cambios</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.sheet + r.row">
              <td>{{ r.row }}</td>
              <td>{{ r.dni || "Sin documento" }}</td>
              <td>{{ r.fullName }}</td>
              <td>
                {{ r.company }}<small>{{ r.positionName }}</small>
              </td>
              <td>
                <span class="badge">{{
                  r.status === "ACTIVE" ? "Activo" : "Cesado"
                }}</span
                ><small>{{ r.hierarchyStatus || "No aplica" }}</small>
              </td>
              <td>
                {{
                  r.action === "INSERT"
                    ? "Nuevo registro"
                    : r.changes.length
                      ? r.changes.join(", ")
                      : "Sin cambios de datos"
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <button :disabled="!page" @click="page--">Anterior</button
        ><span
          >Página {{ page + 1 }} de
          {{ Math.max(1, Math.ceil(filtered.length / 30)) }}</span
        ><button :disabled="(page + 1) * 30 >= filtered.length" @click="page++">
          Siguiente
        </button>
      </div>
      <div class="import-confirm">
        <p>
          La confirmación actualiza la base maestra. Los borradores y versiones
          publicadas se conservan.
        </p>
        <label v-if="preview.repeated" class="check-line"
          ><input type="checkbox" v-model="repeated" />El archivo ya se importó.
          Deseo procesarlo nuevamente.</label
        ><label v-if="preview.summary.conflicts" class="check-line"
          ><input type="checkbox" v-model="conflicts" />Conservar
          {{ preview.summary.conflicts }} conflictos como registros separados;
          sus registros anteriores quedarán ausentes de la base activa cuando
          corresponda.</label
        ><button
          class="primary"
          :disabled="
            busy ||
            (preview.repeated && !repeated) ||
            (preview.summary.conflicts > 0 && !conflicts)
          "
          @click="confirmImport"
        >
          Confirmar importación
        </button>
      </div>
    </template>
    <details v-if="issues.length" class="panel" open>
      <summary>Observaciones · {{ issues.length }}</summary>
      <p class="muted">
        Advertencias no bloqueantes. Las relaciones ambiguas, inexistentes o
        cíclicas no se conectan.
      </p>
      <div class="issue-list">
        <div v-for="(i, index) in issues" :key="index">
          <span class="badge warning">{{ i.code }}</span
          ><strong
            >{{ i.sheet }} · fila {{ i.row ?? i.row_number ?? "—" }}</strong
          >
          <p>{{ i.message }}</p>
        </div>
      </div>
    </details>
    <div class="panel">
      <div class="section-heading">
        <h3>Historial de importaciones</h3>
        <span class="muted">Últimas 100 operaciones</span>
      </div>
      <div v-if="!history.length" class="empty-inline">
        Todavía no hay importaciones confirmadas.
      </div>
      <div class="table-wrap" v-else>
        <table>
          <thead>
            <tr>
              <th>Fecha / archivo</th>
              <th>Procesados</th>
              <th>Insertados</th>
              <th>Actualizados</th>
              <th>Resultado</th>
              <th>Observaciones</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="batch in history" :key="batch.id">
              <td>
                {{ date(batch.created_at) }}<small>{{ batch.filename }}</small
                ><small class="hash" :title="batch.content_hash"
                  >SHA-256 {{ batch.content_hash.slice(0, 16) }}…</small
                >
              </td>
              <td>{{ batch.processed_count }}</td>
              <td>{{ batch.inserted_count }}</td>
              <td>{{ batch.updated_count }}</td>
              <td>
                <span
                  class="badge"
                  :class="batch.result === 'SUCCESS' ? 'success' : 'warning'"
                  >{{
                    batch.result === "SUCCESS" ? "Completado" : "Error"
                  }}</span
                >
              </td>
              <td>
                <button @click="showIssues(batch.id)">
                  Ver {{ batch.issue_count }}
                </button>
              </td>
              <td><button class="danger" :disabled="busy" @click="removeHistory(batch)">Eliminar</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
