import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { config } from '../backend/src/config/index.js';
const backendHost=['0.0.0.0','::'].includes(config.host) ? '127.0.0.1' : config.host;
const backendUrl=`http://${backendHost.includes(':') ? `[${backendHost}]` : backendHost}:${config.port}`;
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": backendUrl },
  },
});
