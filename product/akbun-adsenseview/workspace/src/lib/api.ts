// The only place the page touches Tauri. Everything about Google and the
// cache is answered by Rust; this file just names the commands.

import { invoke } from "@tauri-apps/api/core";

export type Kind = "site" | "page" | "channel";

export type DailyRow = {
  day: string;
  name: string;
  earnings: number;
  page_views: number;
  clicks: number;
  impressions: number;
};

export type Status = {
  signedIn: boolean;
  hasClientSecret: boolean;
  configDir: string;
  settleDays: number;
  currency: string | null;
  version: string;
};

export type ReportResult = {
  rows: DailyRow[];
  apiDays: number;
  cacheDays: number;
  currency: string | null;
};

export type ErrorKind = "auth" | "quota" | "setup" | "other";

export type AppError = {
  kind: ErrorKind;
  message: string;
};

export function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null && "kind" in value && "message" in value;
}

export const api = {
  getStatus: () => invoke<Status>("get_status"),
  signIn: () => invoke<Status>("sign_in"),
  signOut: () => invoke<Status>("sign_out"),
  loadReport: (kind: Kind, start: string, end: string) =>
    invoke<ReportResult>("load_report", { kind, start, end }),
  clearCache: () => invoke<void>("clear_cache"),
  saveSettleDays: (days: number) => invoke<Status>("save_settle_days", { days }),
  openConfigDir: () => invoke<void>("open_config_dir"),
};
