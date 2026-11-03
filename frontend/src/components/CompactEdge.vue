<script setup>
import { BaseEdge } from "@vue-flow/core";
defineProps({ id: String, data: Object, style: Object, markerEnd: String, markerStart: String });
</script>
<template>
  <BaseEdge :id="id" :path="data.layoutPath" :style="style" :marker-end="markerEnd" :marker-start="markerStart" :interaction-width="20" />
</template>
