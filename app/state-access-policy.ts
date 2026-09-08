import type { ChurchRole } from "./permissions";

export const payloadKeysByRole: Record<Exclude<ChurchRole, "MEMBER">, string[]> = {
  ADMIN: [],
  SECRETARY: ["members", "visitors", "kids", "events", "notices", "mural", "messageTemplates", "messageCampaigns", "notificationReadIds"],
  LEADER: ["visitors", "careRequests", "events", "schedules", "ministries", "notices", "mural", "messageTemplates", "messageCampaigns", "devotionals", "notificationReadIds"],
  PROFESSOR: ["schoolClasses", "discipleshipClasses", "attendanceSessions", "schedules", "notificationReadIds"],
  TREASURER: ["transactions", "notificationReadIds"],
};

export const hiddenPayloadKeysByRole: Record<Exclude<ChurchRole, "ADMIN" | "MEMBER">, string[]> = {
  SECRETARY: ["users", "audit", "transactions", "assets"],
  LEADER: ["users", "audit", "registrationRequests", "transactions", "assets", "kids"],
  PROFESSOR: ["users", "audit", "registrationRequests", "visitors", "kids", "careRequests", "transactions", "assets", "messageCampaigns"],
  TREASURER: ["users", "audit", "registrationRequests", "members", "visitors", "kids", "careRequests", "schedules", "attendanceSessions", "messageCampaigns", "assets"],
};

export const visiblePayloadKeysByRole: Record<Exclude<ChurchRole, "ADMIN" | "MEMBER">, string[]> = {
  SECRETARY: [
    "members",
    "visitors",
    "kids",
    "events",
    "notices",
    "mural",
    "ministries",
    "schedules",
    "schoolClasses",
    "discipleshipClasses",
    "attendanceSessions",
    "messageTemplates",
    "messageCampaigns",
    "devotionals",
    "notificationReadIds",
  ],
  LEADER: [
    "members",
    "visitors",
    "careRequests",
    "events",
    "schedules",
    "ministries",
    "notices",
    "mural",
    "schoolClasses",
    "discipleshipClasses",
    "attendanceSessions",
    "messageTemplates",
    "messageCampaigns",
    "devotionals",
    "notificationReadIds",
  ],
  PROFESSOR: [
    "members",
    "events",
    "schedules",
    "notices",
    "mural",
    "schoolClasses",
    "discipleshipClasses",
    "attendanceSessions",
    "devotionals",
    "notificationReadIds",
  ],
  TREASURER: ["transactions", "devotionals", "notificationReadIds"],
};

export function visiblePublishedOnlyKeys(role: ChurchRole) {
  return role === "ADMIN" ? [] : ["devotionals"];
}
