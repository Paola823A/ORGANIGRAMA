<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useCompanies } from "./composables/useCompanies.js";
import autrisaLogo from "./assets/companies/autrisa.png";
import incamotorsLogo from "./assets/companies/incamotors.png";
import novaAutosLogo from "./assets/companies/nova-autos.png";
import grupoAinLogo from "./assets/companies/grupo-ain.png";
import { normalize } from "../../shared/graph.js";
const route = useRoute(),
  { companies, companyId, refreshCompanies } = useCompanies(),
  error = ref(""),
  sidebarHidden = ref(false);
const companyLogo = computed(() => {
  const company = companies.value.find((item) => item.id === companyId.value);
  const name = normalize(company?.name).replace(/[^A-Z0-9]/g, "");
  const brand = name.includes("AUTRISA") ? "autrisa"
    : name.includes("INCAMOTORS") ? "incamotors"
    : name.includes("NOVAAUTO") ? "nova-autos" : null;
  const logos = { autrisa: autrisaLogo, incamotors: incamotorsLogo, "nova-autos": novaAutosLogo };
  return brand ? { src: logos[brand], name: company.name, brand } : null;
});
async function loadCompanies() {
  error.value = "";
  try {
    await refreshCompanies();
  } catch (e) {
    error.value = e.message;
  }
}
onMounted(loadCompanies);
</script>
<template>
  <div class="app-shell" :class="{ 'sidebar-hidden': sidebarHidden }">
    <aside v-show="!sidebarHidden" id="main-sidebar" class="sidebar">
      <a class="brand" href="/graphic">
        <img class="brand-logo" :src="grupoAinLogo" alt="Grupo AIN" />
        <span class="brand-name">ORGANIGRAMA AIN</span>
      </a>
      <div class="workspace-label">ESPACIO DE TRABAJO</div>
      <label class="company-label" for="company">Empresa</label>
      <select id="company" v-model="companyId" class="company-select">
        <option v-if="!companies.length" value="">
          Sin empresas importadas
        </option>
        <option v-for="c in companies" :key="c.id" :value="c.id">
          {{ c.name }}
        </option>
      </select>
      <div class="workspace-label navigation-label">ORGANIZACIÓN</div>
      <nav aria-label="Navegación principal">
        <RouterLink to="/graphic"
          ><span class="nav-icon">▦</span> Organigrama</RouterLink
        >
        <RouterLink to="/canva"
          ><span class="nav-icon">◇</span> Board</RouterLink
        >
        <RouterLink to="/upload"
          ><span class="nav-icon">↥</span> Upload</RouterLink
        >
      </nav>
      <div class="sidebar-footer">
        <span class="status-dot"></span>
        <div>Entorno interno<small>Datos almacenados localmente</small></div>
      </div>
    </aside>
    <main class="main-shell">
      <header class="page-header">
        <div class="header-title-group">
        <button class="sidebar-toggle" @click="sidebarHidden = !sidebarHidden"
          :aria-label="sidebarHidden ? 'Mostrar menú lateral' : 'Ocultar menú lateral'"
          :title="sidebarHidden ? 'Mostrar menú lateral' : 'Ocultar menú lateral'"
          :aria-expanded="!sidebarHidden" aria-controls="main-sidebar">☰</button>
        <div>
          <div class="breadcrumb">
            Organización <span>/</span> {{ route.meta.title }}
          </div>
          <h1>{{ route.meta.title }}</h1>
          <p>{{ route.meta.description }}</p>
        </div>
        </div>
        <div v-if="companyLogo" class="company-logo" :class="companyLogo.brand">
          <img :src="companyLogo.src" :alt="`Logo de ${companyLogo.name}`" />
        </div>
        <div v-else class="header-tag">GESTIÓN DE PERSONAS</div>
      </header>
      <div v-if="error" class="alert error" role="alert">
        {{ error }} <button @click="loadCompanies">Reintentar conexión</button>
      </div>
      <RouterView />
    </main>
  </div>
</template>
