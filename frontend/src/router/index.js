import { createRouter, createWebHistory } from "vue-router";
export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/graphic" },
    {
      path: "/graphic",
      component: () => import("../modules/graphic/GraphicView.vue"),
      meta: {
        title: "Organigrama",
        description: "Consulta la estructura de tu organización",
      },
    },
    {
      path: "/canva",
      component: () => import("../modules/canva/CanvaView.vue"),
      meta: { title: "Board", description: "Diseña y organiza cada equipo" },
    },
    {
      path: "/upload",
      component: () => import("../modules/upload/UploadView.vue"),
      meta: {
        title: "Base de personal",
        description: "Importa, valida y administra la información",
      },
    },
  ],
});
