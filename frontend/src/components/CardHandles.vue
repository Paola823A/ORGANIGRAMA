<script setup>
import { Handle, Position } from "@vue-flow/core";
defineProps({ editable: Boolean, junction: Boolean });
const sides = { top: Position.Top, bottom: Position.Bottom, left: Position.Left, right: Position.Right };
</script>
<template>
    <Handle v-for="(position, side) in sides" :key="side"
      :id="`source-${side}`" type="source" :position="position"
      :connectable="editable"
      :title="`Conectar · ${side}`"
      :class="{ 'junction-handle': junction }"
      :style="{ opacity: editable ? undefined : 0 }" />
</template>
