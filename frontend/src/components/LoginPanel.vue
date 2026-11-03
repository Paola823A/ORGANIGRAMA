<script setup>
import { ref } from 'vue';
import { api } from '../services/api.js';
defineProps({ changePassword:Boolean, unavailable:Boolean });
const emit = defineEmits(['done']);
const username = ref(''), password = ref(''), newPassword = ref(''), confirmation = ref(''), error = ref(''), busy = ref(false);
async function submit(change) {
  error.value = '';busy.value = true;
  try {
    if (change) {
      if (newPassword.value !== confirmation.value) throw new Error('Las contraseñas nuevas no coinciden.');
      await api('/auth/password',{method:'POST',body:{currentPassword:password.value,newPassword:newPassword.value}});
    } else await api('/auth/login',{method:'POST',body:{username:username.value,password:password.value}});
    password.value = '';newPassword.value = '';confirmation.value = '';emit('done');
  } catch(e) {error.value = e.message;} finally {busy.value = false;}
}
</script>
<template>
  <section class="login-page">
    <form class="access-card" @submit.prevent="submit(changePassword)">
      <h1>{{ changePassword ? 'Cambiar contraseña' : 'ORGANIGRAMA AIN' }}</h1>
      <p v-if="unavailable">El creador debe configurar su cuenta en el servidor antes de habilitar el acceso.</p>
      <template v-else>
        <p>{{ changePassword ? 'Elige una contraseña personal. Después volverás a iniciar sesión.' : 'Ingresa con una cuenta autorizada por el creador.' }}</p>
        <label v-if="!changePassword">Usuario o correo<input v-model="username" required autocomplete="username" maxlength="100" /></label>
        <label>{{ changePassword ? 'Contraseña actual' : 'Contraseña' }}<input v-model="password" type="password" required autocomplete="current-password" /></label>
        <template v-if="changePassword">
          <label>Nueva contraseña<input v-model="newPassword" type="password" required minlength="6" autocomplete="new-password" /></label>
          <label>Repetir nueva contraseña<input v-model="confirmation" type="password" required minlength="6" autocomplete="new-password" /></label>
        </template>
        <p v-if="error" role="alert" class="alert error">{{ error }}</p>
        <button class="primary" :disabled="busy">{{ busy ? 'Procesando…' : changePassword ? 'Guardar contraseña' : 'Iniciar sesión' }}</button>
      </template>
    </form>
  </section>
</template>
