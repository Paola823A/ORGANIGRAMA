import { ref } from 'vue';
import { api } from '../services/api.js';
const ready = ref(false), user = ref(null), localMode = ref(false), enabled = ref(false);
export function useAuth() {
  async function refresh() {
    const state = await api('/auth/session');
    user.value = state.user; localMode.value = state.localMode; enabled.value = state.enabled; ready.value = true;
  }
  function can(module, companyId) {
    if (localMode.value || user.value?.role === 'OWNER') return true;
    return user.value?.permissions.some((p) => p.companyId === companyId && (p.module === module || module === 'graphic' && p.module === 'board')) || false;
  }
  return { ready,user,localMode,enabled,refresh,can };
}
