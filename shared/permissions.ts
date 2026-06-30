export const USER_ROLES = ["chef", "admin", "manager", "bauleiter", "buchhaltung", "mitarbeiter", "bot"] as const;
export type UserRole = typeof USER_ROLES[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  chef: "Geschäftsführer",
  admin: "Administrator",
  manager: "Manager",
  bauleiter: "Bauleiter",
  buchhaltung: "Buchhaltung",
  mitarbeiter: "Mitarbeiter",
  bot: "Bot / Automatisierung",
};

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  chef: 100,
  admin: 90,
  manager: 70,
  bauleiter: 60,
  buchhaltung: 50,
  mitarbeiter: 30,
  bot: 20,
};

export type PermissionArea =
  | "dashboard_kpi"
  | "dashboard_revenue"
  | "dashboard_quick_actions"
  | "dashboard_gewerke"
  | "kunden"
  | "projekte"
  | "dokumente"
  | "dokumente_erstellen"
  | "finanzen"
  | "rechnungsbuch"
  | "offene_posten"
  | "rechnungseingang"
  | "kassenbuch"
  | "finanzbuchhaltung"
  | "personal"
  | "lohnstunden"
  | "ressourcen"
  | "termine"
  | "kalkulation"
  | "nachkalkulation"
  | "disposition"
  | "stuecklisten"
  | "organisation"
  | "wiedervorlagen"
  | "postbuch"
  | "lager"
  | "materialstamm"
  | "stammdaten"
  | "einstellungen"
  | "benutzerverwaltung"
  | "import"
  | "bwa"
  | "vertraege"
  | "bank";

const ALL_AREAS: PermissionArea[] = [
  "dashboard_kpi", "dashboard_revenue", "dashboard_quick_actions", "dashboard_gewerke",
  "kunden", "projekte", "dokumente", "dokumente_erstellen",
  "finanzen", "rechnungsbuch", "offene_posten", "rechnungseingang", "kassenbuch", "finanzbuchhaltung",
  "personal", "lohnstunden", "ressourcen", "termine",
  "kalkulation", "nachkalkulation", "disposition", "stuecklisten",
  "organisation", "wiedervorlagen", "postbuch",
  "lager", "materialstamm",
  "stammdaten", "einstellungen", "benutzerverwaltung", "import", "bwa", "vertraege", "bank",
];

const ROLE_PERMISSIONS: Record<UserRole, PermissionArea[]> = {
  chef: ALL_AREAS,
  admin: ALL_AREAS,
  manager: [
    "dashboard_kpi", "dashboard_revenue", "dashboard_quick_actions", "dashboard_gewerke",
    "kunden", "projekte", "dokumente", "dokumente_erstellen",
    "finanzen", "rechnungsbuch", "offene_posten", "rechnungseingang", "kassenbuch", "bank",
    "personal", "lohnstunden", "ressourcen", "termine",
    "kalkulation", "nachkalkulation", "disposition", "stuecklisten",
    "organisation", "wiedervorlagen", "postbuch",
    "lager", "materialstamm",
    "stammdaten", "bwa", "vertraege",
  ],
  bauleiter: [
    "dashboard_kpi", "dashboard_quick_actions", "dashboard_gewerke",
    "kunden", "projekte", "dokumente", "dokumente_erstellen",
    "personal", "lohnstunden", "ressourcen", "termine",
    "kalkulation", "nachkalkulation", "disposition", "stuecklisten",
    "organisation", "wiedervorlagen",
    "lager", "materialstamm",
    "vertraege",
  ],
  buchhaltung: [
    "dashboard_kpi", "dashboard_revenue",
    "kunden", "projekte", "dokumente",
    "finanzen", "rechnungsbuch", "offene_posten", "rechnungseingang", "kassenbuch", "finanzbuchhaltung", "bank",
    "organisation", "wiedervorlagen", "postbuch",
    "stammdaten", "bwa",
  ],
  mitarbeiter: [
    "dashboard_kpi", "dashboard_gewerke",
    "projekte", "dokumente",
    "personal", "lohnstunden",
    "organisation", "wiedervorlagen",
    "lager", "materialstamm",
    "vertraege",
  ],
  bot: [
    "dashboard_kpi",
    "kunden", "projekte", "dokumente", "dokumente_erstellen",
    "lager", "materialstamm",
    "stammdaten",
  ],
};

export function hasPermission(role: string, area: PermissionArea): boolean {
  const r = role as UserRole;
  const perms = ROLE_PERMISSIONS[r];
  if (!perms) return false;
  return perms.includes(area);
}

export function getPermissions(role: string): PermissionArea[] {
  return ROLE_PERMISSIONS[role as UserRole] || [];
}

export function canAccessRoute(role: string, path: string): boolean {
  const r = role as UserRole;
  if (r === "chef" || r === "admin") return true;

  const routeMap: Record<string, PermissionArea> = {
    "/": "dashboard_kpi",
    "/kunden": "kunden",
    "/projekte": "projekte",
    "/dokumente": "dokumente",
    "/rechnungsbuch": "rechnungsbuch",
    "/offene-posten": "offene_posten",
    "/rechnungseingang": "rechnungseingang",
    "/kassenbuch": "kassenbuch",
    "/ueberweisungen": "finanzen",
    "/finanzen": "finanzbuchhaltung",
    "/lohnstunden": "lohnstunden",
    "/ressourcen": "ressourcen",
    "/termine": "termine",
    "/nachkalkulation": "nachkalkulation",
    "/disposition": "disposition",
    "/stuecklisten": "stuecklisten",
    "/wiedervorlagen": "wiedervorlagen",
    "/postbuch": "postbuch",
    "/materialstamm": "materialstamm",
    "/lager": "lager",
    "/materialien": "stammdaten",
    "/stundensatz": "stammdaten",
    "/bwa": "bwa",
    "/floskeln": "stammdaten",
    "/designer": "stammdaten",
    "/import": "import",
    "/einstellungen": "einstellungen",
    "/vertraege": "vertraege",
    "/bank": "bank",
  };

  const area = routeMap[path];
  if (!area) return true;
  return hasPermission(role, area);
}

export const PERMISSION_AREA_LABELS: Record<PermissionArea, string> = {
  dashboard_kpi: "Dashboard KPIs",
  dashboard_revenue: "Umsatzanalyse",
  dashboard_quick_actions: "Schnellaktionen",
  dashboard_gewerke: "Gewerke",
  kunden: "Kunden",
  projekte: "Projekte",
  dokumente: "Dokumente einsehen",
  dokumente_erstellen: "Dokumente erstellen",
  finanzen: "Finanzen (Allgemein)",
  rechnungsbuch: "Rechnungsbuch / Mahnung",
  offene_posten: "Offene Posten",
  rechnungseingang: "Rechnungseingang",
  kassenbuch: "Kassenbuch",
  finanzbuchhaltung: "Finanzbuchhaltung",
  personal: "Personal (Allgemein)",
  lohnstunden: "Lohnstundenerfassung",
  ressourcen: "Ressourcenplanung",
  termine: "Termine / Personal",
  kalkulation: "Kalkulation (Allgemein)",
  nachkalkulation: "Nachkalkulation",
  disposition: "Auftragsdisposition",
  stuecklisten: "Stücklisten / Jumbos",
  organisation: "Organisation (Allgemein)",
  wiedervorlagen: "Wiedervorlagen",
  postbuch: "Postbuch",
  lager: "Lager / Bestellungen",
  materialstamm: "Materialstamm / Serien",
  stammdaten: "Stammdaten",
  einstellungen: "Einstellungen",
  benutzerverwaltung: "Benutzerverwaltung",
  import: "Datenimport",
  bwa: "BWA Auswertung",
  vertraege: "Verträge / Bautagebuch",
  bank: "Bank",
};
