<script setup>
import CardHandles from "./CardHandles.vue";
import { cardTextColor, cardTextStyle } from "../services/cardStyle.js";
import { computed } from "vue";
import { cardContent } from "../services/cardContent.js";
const props = defineProps({ data: Object });
const content = computed(() => cardContent(props.data.node, props.data.showNames));
const labels = {
  EMPLOYEE: "Colaborador",
  POSITION: "Puesto",
  BUSINESS_LINE: "Línea de negocio",
  BRANCH: "Sede",
  AREA: "Área",
  GROUP: "Grupo",
  CUSTOM: "Tarjeta",
};
</script>
<template>
  <article
    class="chart-card"
    :class="{
      'is-highlighted': data.highlight,
      'is-manual': data.node.type !== 'EMPLOYEE',
      'is-sliding': data.sliding,
      'is-ceased': data.node.metadata.employmentStatus === 'CEASED',
      'is-visual-copy': data.node.metadata.visualOnly,
      'pending-review': data.editable && data.node.metadata.pendingReview,
    }"
    :style="{
      ...cardTextStyle(data.node.style),
      width: data.node.width + 'px',
      height: data.node.height + 'px',
      backgroundColor: data.node.style.backgroundColor,
      color: cardTextColor(data.node),
      borderColor: data.node.style.borderColor,
      borderStyle: data.node.style.borderStyle,
    }"
  >
    <CardHandles :editable="data.editable" />
    <span v-if="data.node.metadata.visualOnly" class="visual-copy-label" title="Copia solo visual: no suma en los contadores">Solo visual</span>
    <div v-if="data.node.type !== 'EMPLOYEE'" class="card-kicker">
      <span>{{ labels[data.node.type] }}</span
      ><span
        v-if="data.node.metadata.employmentStatus === 'CEASED'"
        class="ceased-tag"
        >Cesado</span
      ><span
        v-else-if="data.node.metadata.employmentStatus === 'ABSENT'"
        class="ceased-tag"
        >Ausente</span
      >
    </div>
    <div class="card-content">
    <strong class="card-title" :title="content.heading">{{ content.heading }}</strong>
    <span v-if="content.name" class="card-subtitle" :title="content.name">{{ content.name }}</span>
    <span v-if="content.area" class="card-details" :title="content.area">{{ content.area }}</span>
    <span v-if="content.branch" class="card-details card-branch" :title="content.branch">{{ content.branch }}</span>
    </div>
    <span v-if="data.node.type === 'EMPLOYEE' && ['CEASED', 'ABSENT'].includes(data.node.metadata.employmentStatus)" class="ceased-tag card-employment-status">{{ data.node.metadata.employmentStatus === 'CEASED' ? 'Cesado' : 'Ausente' }}</span>
    <button
      v-if="data.hasChildren"
      class="collapse-button nodrag nopan"
      :class="{ 'is-collapsed': data.collapsed }"
      @click.stop="data.toggle(data.node.id)"
      :aria-expanded="!data.collapsed"
      :aria-label="`${data.collapsed ? 'Expandir' : 'Contraer'} equipo de ${data.teamCount} ${data.teamCount === 1 ? 'persona' : 'personas'} a cargo de ${data.node.title}`"
      :title="`${data.teamCount} ${data.teamCount === 1 ? 'persona' : 'personas'} a cargo (directas e indirectas). Clic para ${data.collapsed ? 'expandir' : 'contraer'}.`"
    >
      {{ data.teamCount }} {{ data.teamCount === 1 ? 'persona' : 'personas' }} <span aria-hidden="true">{{ data.collapsed ? '▾' : '▴' }}</span>
    </button>
  </article>
</template>
