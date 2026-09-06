import type { ChurchRole } from "./permissions";

export const payloadKeysByRole: Record<Exclude<ChurchRole, "MEMBER">, string[]> = {
  ADMIN: [],
  SECRETARY: ["members", "visitors", "kids", "events", "notices", "mural", "notificationReadIds"],
  LEADER: ["visitors", "careRequests", "events", "schedules", "ministries", "notices", "mural", "devotionals", "notificationReadIds"],
  PROFESSOR: ["schoolClasses", "discipleshipClasses", "attendanceSessions", "schedules", "notificationReadIds"],
  TREASURER: ["transactions", "notificationReadIds"],
};

export const hiddenPayloadKeysByRole: Record<Exclude<ChurchRole, "ADMIN" | "MEMBER">, string[]> = {
  SECRETARY: ["users", "audit", "transactions", "assets", "messageCampaigns"],
  LEADER: ["users", "audit", "transactions", "assets", "kids", "messageCampaigns"],
  PROFESSOR: ["users", "audit", "visitors", "kids", "careRequests", "transactions", "assets", "messageCampaigns"],
  TREASURER: ["users", "audit", "members", "visitors", "kids", "careRequests", "schedules", "attendanceSessions", "messageCampaigns", "assets"],
};

export function visiblePublishedOnlyKeys(role: ChurchRole) {
  return role === "ADMIN" ? [] : ["devotionals"];
}
