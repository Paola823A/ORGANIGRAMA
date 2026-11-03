<script setup>
import { computed, ref, watch } from "vue";
import { isGroupingNode } from "../../../shared/graph.js";
const props = defineProps({ node: Object });
const emit = defineEmits(["save", "duplicate", "remove", "layout"]);
const form = ref(null);
watch(
  () => props.node,
  (value) => (form.value = value ? JSON.parse(JSON.stringify(value)) : null),
  { immediate: true },
);
const grouping = computed(() => isGroupingNode(form.value));
const allLabels = {
  EMPLOYEE: "Empleado",
  POSITION: "Puesto / vacante",
  BUSINESS_LINE: "Línea de negocio",
  BRANCH: "Sede",
  AREA: "Área",
  GROUP: "Grupo",
  CUSTOM: "Título personalizado",
};
const labels = computed(() => Object.fromEntries(Object.entries(allLabels).filter(([type]) => isGroupingNode({ type }) === grouping.value)));
</script>
<template>
  <aside class="properties-panel" v-if="form">
    <div class="panel-heading">
      <h3>Propiedades</h3>
      <span class="badge">{{ grouping ? 'Agrupador' : 'Tarjeta' }}</span>
    </div>
    <div v-if="form.type === 'JUNCTION'">
      <p class="muted small">Arrastra este punto para ubicar la unión. Acerca el cursor o selecciónalo para mostrar sus conectores; cada uno sirve como entrada o salida.</p>
      <button class="danger full-width" @click="emit('remove')">Eliminar punto y sus conexiones</button>
    </div>
    <form v-else @submit.prevent="emit('save', form)">
      <label
        >Tipo<select v-model="form.type">
          <option
            v-for="(label, key) in labels"
            :key="key"
            :value="key"
            :disabled="key === 'EMPLOYEE' && !form.employeeId"
          >
            {{ label }}
          </option>
        </select></label
      >
      <label
        >{{ form.type === 'EMPLOYEE' ? 'Título (puesto)' : 'Título' }}<textarea
          v-model="form[form.type === 'EMPLOYEE' ? 'subtitle' : 'title']"
          maxlength="500"
          rows="3"
          required
        /></label
      ><label
        >{{ form.type === 'EMPLOYEE' ? 'Subtítulo (nombre)' : grouping ? 'Descripción' : 'Subtítulo' }}<textarea v-model="form[form.type === 'EMPLOYEE' ? 'title' : 'subtitle']" maxlength="500" rows="2" />
      </label>
      <label v-if="!grouping">Área<input v-model="form.metadata.area" maxlength="500" /></label>
      <label v-if="!grouping">Sede<input v-model="form.metadata.branch" maxlength="500" /></label>
      <p v-if="form.metadata.visualOnly" class="muted small">Copia visual: conserva a la persona de referencia, pero no suma en ningún contador. Puedes cambiar su sede, área o textos.</p>
      <p v-if="form.metadata.employmentStatus === 'CEASED'" class="muted small">Personal cesado: su texto se muestra automáticamente en rojo.</p>
      <div class="field-pair">
        <label
          >Ancho<input
            type="number"
            min="60"
            max="2000"
            v-model.number="form.width"
            required /></label
        ><label
          >Alto<input
            type="number"
            min="60"
            max="2000"
            v-model.number="form.height"
            required
        /></label>
      </div>
      <div class="field-pair">
        <label
          >X<input
            type="number"
            step="any"
            v-model.number="form.position.x"
            required /></label
        ><label
          >Y<input
            type="number"
            step="any"
            v-model.number="form.position.y"
            required
        /></label>
      </div>
      <label
        >Orden entre hermanas<input
          type="number"
          min="-100000"
          max="100000"
          v-model.number="form.siblingOrder"
          required
      /></label>
      <div class="color-fields">
        <label
          >Fondo<input
            type="color"
            v-model="form.style.backgroundColor" /></label
        ><label
          >Texto<input type="color" v-model="form.style.textColor" /></label
        ><label
          >Borde<input type="color" v-model="form.style.borderColor"
        /></label>
      </div>
      <label>Alineación horizontal<select v-model="form.style.textAlign">
        <option :value="undefined">Izquierda (predeterminada)</option>
        <option value="left">Izquierda</option>
        <option value="center">Centrada</option>
        <option value="right">Derecha</option>
      </select></label>
      <fieldset class="text-format-controls">
        <legend>Formato de texto</legend>
        <label class="check-line"><input type="checkbox" :checked="form.style.bold !== false" @change="form.style.bold = $event.target.checked" />Negrita</label>
        <label class="check-line"><input type="checkbox" v-model="form.style.italic" />Cursiva</label>
        <label class="check-line"><input type="checkbox" v-model="form.style.strikethrough" />Tachado</label>
      </fieldset>
      <label
        >Borde<select v-model="form.style.borderStyle">
          <option value="solid">Continuo</option>
          <option value="dashed">Discontinuo</option>
        </select></label
      >
      <details>
        <summary>Clasificación y estado</summary>
        <label
          >Giro<input
            v-model="form.metadata.businessLine"
            maxlength="500" /></label
        ><label class="check-line"
          ><input type="checkbox" v-model="form.collapsed" />Contraída al
          abrir</label
        >
      </details>
      <button class="primary full-width" type="submit">
        Aplicar propiedades
      </button>
    </form>
    <div v-if="form.type !== 'JUNCTION'" class="property-actions">
      <button @click="emit('duplicate')">{{ form.type === 'EMPLOYEE' ? 'Duplicar como copia visual' : grouping ? 'Duplicar agrupador' : 'Duplicar tarjeta' }}</button
      ><button @click="emit('layout')">Distribuir esta rama</button
      ><button class="danger" @click="emit('remove')">{{ grouping ? 'Eliminar agrupador' : 'Eliminar tarjeta' }}</button>
    </div>
    <p class="muted small" v-if="form.employeeId">
      Solo se modifica la tarjeta visual. Los datos maestros se conservan.
    </p>
  </aside>
</template>
