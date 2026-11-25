<script setup>
import CardHandles from "./CardHandles.vue";
defineProps({ data: Object });
</script>
<template>
  <div class="junction-node" :class="{ 'is-editable': data.editable }"
    :style="{ width: data.node.width + 'px', height: data.node.height + 'px', backgroundColor: data.editable ? data.node.style.backgroundColor : 'transparent' }"
    :title="data.editable ? 'Punto de unión: acerca el cursor para conectar o arrastra el punto para moverlo' : undefined">
    <CardHandles :editable="data.editable" junction />
  </div>
</template>
