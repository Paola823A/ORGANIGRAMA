import { ref } from "vue";
import { api } from "../services/api.js";
import { companyChoices } from "../services/companyChoices.js";
const companies = ref([]),
  companyId = ref("");
export function useCompanies() {
  async function refreshCompanies() {
    companies.value = companyChoices(await api("/companies"));
    if (!companies.value.some((c) => c.id === companyId.value))
      companyId.value = companies.value[0]?.id || "";
  }
  return { companies, companyId, refreshCompanies };
}
