import { normalize } from "../../../shared/graph.js";

// This source label belongs to historical ceased records, not a selectable company.
// Retain those records in the database without displaying an extra workspace.
export function companyChoices(companies) {
  return companies.filter((company) => normalize(company.name) !== "SEMINUEVOS");
}
