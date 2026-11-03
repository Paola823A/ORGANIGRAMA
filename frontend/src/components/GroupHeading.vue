<script setup>
import CardHandles from "./CardHandles.vue";
import { cardTextStyle, groupBaseStyle } from "../services/cardStyle.js";
defineProps({ data: Object });
</script>
<template>
  <section class="group-heading" :class="{ 'is-highlighted': data.highlight }"
    :style="{ ...cardTextStyle(data.node.style), width: data.node.width + 'px', height: data.node.height + 'px', color: data.node.style.textColor,
      backgroundColor: data.node.style.backgroundColor, borderColor: data.node.style.borderColor, ...groupBaseStyle(data.node) }">
    <CardHandles :editable="data.editable" />
    <strong class="group-heading-title" :title="data.node.title">{{ data.node.title }}</strong>
    <span v-if="data.node.subtitle" class="group-heading-subtitle">{{ data.node.subtitle }}</span>
    <button v-if="data.hasChildren" class="group-toggle nodrag nopan" @click.stop="data.toggle(data.node.id)"
      :aria-expanded="!data.collapsed" :aria-label="`${data.collapsed ? 'Mostrar' : 'Ocultar'} ${data.node.title}`"
      :title="`${data.teamCount} personas únicas de la base de personal`">
      {{ data.collapsed ? 'Mostrar ▾' : 'Ocultar ▴' }}
    </button>
  </section>
</template>
