<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { useRoute } from "vue-router";
import { useCompanies } from "./composables/useCompanies.js";
import autrisaLogo from "./assets/companies/autrisa.png";
import incamotorsLogo from "./assets/companies/incamotors.png";
import novaAutosLogo from "./assets/companies/nova-autos.png";
import grupoAinLogo from "./assets/companies/grupo-ain.png";
import { normalize } from "../../shared/graph.js";
import { companyTheme } from "../../shared/theme.js";
import { useAuth } from "./composables/useAuth.js";
import { api } from "./services/api.js";
import LoginPanel from "./components/LoginPanel.vue";
const { ready,user,localMode,enabled,refresh,can } = useAuth();
const passwordOpen = ref(false);
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
const brandStyle = computed(()=>{const theme=companyTheme(companies.value.find(c=>c.id===companyId.value)?.name);return {'--accent':theme.accent,'--accent-hover':theme.hover,'--brand-color':theme.color,'--brand-soft':theme.soft};});
async function loadCompanies() {
  error.value = "";
  try {
    await refreshCompanies();
  } catch (e) {
    error.value = e.message;
  }
}
async function initialize() {
  try { await refresh(); if (localMode.value || user.value && !user.value.mustChangePassword) await loadCompanies(); }
  catch(e) { error.value = e.message; }
}
async function signedIn() { passwordOpen.value = false;await initialize(); }
async function logout() { await api('/auth/logout',{method:'POST'});window.location.reload(); }
const allowed = computed(() => route.path === '/users' ? localMode.value || user.value?.role === 'OWNER'
  : route.path === '/upload' ? can('upload',companyId.value)
  : can(route.path === '/canva' ? 'board':'graphic',companyId.value));
onMounted(() => { initialize();window.addEventListener('ain-auth-expired',initialize); });
onBeforeUnmount(() => window.removeEventListener('ain-auth-expired',initialize));
</script>
<template>
  <div v-if="!ready" class="login-page"><p>{{ error || 'Cargando…' }}</p><button v-if="error" @click="initialize">Reintentar</button></div>
  <LoginPanel v-else-if="!localMode && (!user || user.mustChangePassword || passwordOpen)" :unavailable="!enabled" :change-password="!!user && (user.mustChangePassword || passwordOpen)" @done="signedIn" />
  <div v-else class="app-shell" :class="{ 'sidebar-hidden': sidebarHidden }">
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
        <RouterLink v-if="can('graphic',companyId)" to="/graphic"
          ><span class="nav-icon">▦</span> Organigrama</RouterLink
        >
        <RouterLink v-if="can('board',companyId)" to="/canva"
          ><span class="nav-icon">◇</span> Board</RouterLink
        >
        <RouterLink v-if="can('upload',companyId)" to="/upload"
          ><span class="nav-icon">↥</span> Upload</RouterLink
        >
        <RouterLink v-if="localMode || user?.role === 'OWNER'" to="/users"><span class="nav-icon">♙</span> Usuarios y permisos</RouterLink>
      </nav>
      <div class="sidebar-footer">
        <span class="status-dot"></span>
        <div>{{ user?.displayName || 'Modo local' }}<small>{{ user?.role === 'OWNER' ? 'Creador' : user ? 'Acceso autorizado' : 'Usuarios sin activar' }}</small>
          <template v-if="user"><button v-if="user.role === 'OWNER'" @click="passwordOpen=true">Cambiar contraseña</button><button @click="logout">Cerrar sesión</button></template>
        </div>
      </div>
    </aside>
    <main class="main-shell" :style="brandStyle">
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
      <RouterView v-if="allowed" />
      <section v-else class="users-page"><h2>Sin acceso a este módulo</h2><p>Selecciona una empresa y un módulo autorizados. El creador puede modificar tus permisos.</p></section>
    </main>
  </div>
</template>
