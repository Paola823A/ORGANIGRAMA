<script setup>
import { computed,nextTick,onMounted,ref,watch } from 'vue';
import { api } from '../../services/api.js';
import { useAuth } from '../../composables/useAuth.js';
import { useCompanies } from '../../composables/useCompanies.js';
const { user,localMode } = useAuth(), { companies } = useCompanies();
const users = ref([]), error = ref(''), notice = ref(''), busy = ref(false), form = ref(null), query = ref(''), employees = ref([]);
const searchText = ref(''), companyFilter = ref(''), moduleFilter = ref(''), statusFilter = ref(''), page = ref(0), deleting = ref(null);
const modalElement = ref(null);
const shareCredentials=ref(null);
async function copyCredentials() {
  try {await navigator.clipboard.writeText(`Usuario: ${shareCredentials.value.username}\nContraseña: ${shareCredentials.value.password}`);notice.value='Usuario y contraseña copiados.';}
  catch{error.value='El navegador no permitió copiar. Intenta nuevamente.';}
}
watch(form,async value=>{if(value){await nextTick();modalElement.value?.querySelector('input')?.focus();}});
const companyName = id => companies.value.find(c=>c.id===id)?.name || id;
const moduleName = module => ({graphic:'Organigrama',board:'Board',upload:'Upload'})[module];
const filtered = computed(()=>users.value.filter(account=>{
  const text = `${account.displayName} ${account.username} ${account.permissions.map(p=>companyName(p.companyId)).join(' ')}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const term = searchText.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  return text.includes(term) && (!statusFilter.value || account.status===statusFilter.value)
    && ((!companyFilter.value && !moduleFilter.value) || account.role==='OWNER' || account.permissions.some(p=>(!companyFilter.value || p.companyId===companyFilter.value) && (!moduleFilter.value || p.module===moduleFilter.value)));
}));
const rows = computed(()=>filtered.value.slice(page.value*20,page.value*20+20));
watch([searchText,companyFilter,moduleFilter,statusFilter],()=>page.value=0);
async function load() { users.value = await api('/auth/users'); }
function edit(account) { notice.value = '';error.value = '';deleting.value=null;form.value = account ? {...account,permissions:account.permissions.map(p=>({...p})),password:''} : {username:'',displayName:'',employeeId:'',password:'',permissions:[],status:'APPROVED'};employees.value = [];query.value = ''; }
async function search() { try { employees.value = (await api(`/employees?q=${encodeURIComponent(query.value)}&limit=30`)).items; } catch(e) { error.value = e.message; } }
function checked(companyId,module) { return form.value.permissions.some(p=>p.companyId===companyId && p.module===module); }
function toggle(companyId,module,value) { form.value.permissions = form.value.permissions.filter(p=>p.companyId!==companyId || p.module!==module);if(value) form.value.permissions.push({companyId,module}); }
async function save() {
  error.value = '';busy.value = true;
  try {
    const value = await api(form.value.id ? `/auth/users/${form.value.id}` : '/auth/users',{method:form.value.id ? 'PUT':'POST',body:form.value});
    if(form.value.password) shareCredentials.value={username:value.username,password:form.value.password};
    else shareCredentials.value=null;
    notice.value = form.value.id ? 'Usuario y permisos actualizados.' : 'Cuenta creada. El usuario ya puede ingresar con los permisos asignados.';
    await load();form.value = null;
  } catch(e) { error.value = e.message; } finally {busy.value = false;}
}
async function remove() {
  error.value='';busy.value=true;
  try {await api(`/auth/users/${deleting.value.id}`,{method:'DELETE'});if(form.value?.id===deleting.value.id) form.value=null;deleting.value=null;await load();page.value=Math.min(page.value,Math.max(0,Math.ceil(filtered.value.length/20)-1));notice.value='Usuario eliminado. Su acceso y sus sesiones se cerraron.';}
  catch(e){error.value=e.message;} finally{busy.value=false;}
}
onMounted(async()=>{if(user.value?.role==='OWNER') try {await load();} catch(e) {error.value=e.message;}});
</script>
<template>
  <section class="users-page">
    <template v-if="localMode">
      <h2>Activar usuarios y permisos</h2>
      <p>Crea tu cuenta en la terminal y luego inicia sesión:</p>
      <code>npm run create-owner</code>
    </template>
    <template v-else>
      <p>Busca una cuenta para editarla o crea un nuevo usuario.</p>
      <p v-if="error" class="alert error" role="alert">{{ error }}</p>
      <p v-if="notice" class="alert success" role="status">{{ notice }}</p>
      <div v-if="shareCredentials" class="toolbar-group"><button @click="copyCredentials">Copiar usuario y contraseña de {{ shareCredentials.username }}</button><button @click="shareCredentials=null">Ocultar</button></div>
      <div class="users-table-layout">
        <div class="access-card">
          <button @click="edit(null)">+ Crear usuario</button>
          <div class="user-table-filters">
            <input v-model="searchText" type="search" aria-label="Buscar usuarios" placeholder="Buscar nombre, usuario o empresa…" />
            <select v-model="companyFilter" aria-label="Filtrar usuarios por empresa"><option value="">Todas las empresas</option><option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option></select>
            <select v-model="moduleFilter" aria-label="Filtrar usuarios por módulo"><option value="">Todos los módulos</option><option value="graphic">Organigrama</option><option value="board">Board</option><option value="upload">Upload</option></select>
            <select v-model="statusFilter" aria-label="Filtrar usuarios por estado"><option value="">Todos los estados</option><option value="APPROVED">Activos</option><option value="DISABLED">Deshabilitados</option></select>
          </div>
          <div class="user-table-scroll"><table class="permissions-table user-table"><caption>{{ filtered.length }} usuarios</caption><thead><tr><th>Nombre</th><th>Usuario</th><th>Estado</th><th>Empresas y módulos</th><th>Acciones</th></tr></thead><tbody>
            <tr v-for="account in rows" :key="account.id"><td>{{ account.displayName }}</td><td>{{ account.username }}</td><td>{{ account.role==='OWNER' ? 'Creador' : account.status==='APPROVED' ? 'Activo':'Deshabilitado' }}</td><td><span v-if="account.role==='OWNER'">Todas las empresas y módulos</span><template v-else><div v-for="p in account.permissions" :key="p.companyId+p.module">{{ companyName(p.companyId) }} · {{ moduleName(p.module) }}</div><span v-if="!account.permissions.length">Sin módulos asignados</span></template></td><td><div v-if="account.role!=='OWNER'" class="toolbar-group"><button @click="edit(account)">Editar</button><button class="danger" :disabled="busy" @click="deleting=account">Eliminar</button></div><span v-else>Cuenta principal</span></td></tr>
            <tr v-if="!rows.length"><td colspan="5">No hay usuarios con estos filtros.</td></tr>
          </tbody></table></div>
          <div class="pagination"><button :disabled="page===0" @click="page--">Anterior</button><span>Página {{ page+1 }} de {{ Math.max(1,Math.ceil(filtered.length/20)) }}</span><button :disabled="(page+1)*20>=filtered.length" @click="page++">Siguiente</button></div>
          <div v-if="deleting" class="alert warning" role="alert"><p>¿Eliminar la cuenta de {{ deleting.displayName }} ({{ deleting.username }})? Perderá su acceso; sus tarjetas de personal e importaciones se conservan.</p><button class="danger" :disabled="busy" @click="remove">Eliminar usuario</button> <button :disabled="busy" @click="deleting=null">Cancelar</button></div>
        </div>
        <div v-if="form" class="modal-backdrop" @click.self="!busy && (form=null)" @keydown.esc="!busy && (form=null)">
        <form ref="modalElement" class="modal access-card user-account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title" @submit.prevent="save">
          <h3 id="account-modal-title">{{ form.id ? 'Editar usuario' : 'Crear usuario' }}</h3>
          <p v-if="error" class="alert error" role="alert">{{ error }}</p>
          <template v-if="!form.id">
            <label>Buscar personal de la base</label>
            <div class="toolbar-group"><input v-model="query" placeholder="Nombre, DNI o puesto" /><button type="button" @click="search">Buscar</button></div>
            <label>Vincular empleado (opcional)<select v-model="form.employeeId"><option value="">Cuenta sin empleado vinculado</option><option v-for="e in employees" :key="e.id" :value="e.id">{{ e.full_name }} · {{ e.company }}</option></select></label>
          </template>
          <label v-if="form.id || !form.employeeId">Nombre<input v-model="form.displayName" required maxlength="200" /></label>
          <label>Usuario o correo<input v-model="form.username" required minlength="3" maxlength="100" autocomplete="off" /></label>
          <label v-if="form.id">Estado<select v-model="form.status"><option value="APPROVED">Activo</option><option value="DISABLED">Deshabilitado</option></select></label>
          <label>{{ form.id ? 'Nueva contraseña (opcional)' : 'Contraseña' }}<input v-model="form.password" type="password" :required="!form.id" minlength="6" autocomplete="new-password" /></label>
          <small>Mínimo 6 caracteres. {{ form.id ? 'Vacío: conserva la contraseña actual.' : '' }}</small>
          <table class="permissions-table"><caption>Acceso por empresa y módulo</caption><thead><tr><th>Empresa</th><th>Organigrama</th><th>Board</th><th>Upload</th></tr></thead><tbody><tr v-for="company in companies" :key="company.id"><th>{{ company.name }}</th><td v-for="module in ['graphic','board','upload']" :key="module"><input type="checkbox" :aria-label="`${({graphic:'Organigrama',board:'Board',upload:'Upload'})[module]} de ${company.name}`" :checked="checked(company.id,module)" @change="toggle(company.id,module,$event.target.checked)" /></td></tr></tbody></table>
          <div class="toolbar-group"><button class="primary" :disabled="busy">{{ form.id ? 'Guardar cambios' : 'Crear usuario' }}</button><button type="button" :disabled="busy" @click="form=null">Cerrar</button></div>
        </form>
        </div>
      </div>
    </template>
  </section>
</template>
