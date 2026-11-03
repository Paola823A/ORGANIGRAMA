<script setup>
import CardHandles from "./CardHandles.vue";
defineProps({ data: Object });
</script>
<template>
  <div class="junction-node" :class="{ 'is-editable': data.editable }"
    :style="{ width: data.node.width + 'px', height: data.node.height + 'px', backgroundColor: data.node.style.backgroundColor }"
    title="Punto de unión: acerca el cursor para conectar o arrastra el punto para moverlo">
    <CardHandles :editable="data.editable" junction />
  </div>
</template>
