export type AppSurface = "student" | "admin";

export const APP_INFO = {
  student: { name: "Launchpad", surface: "student" },
  admin: { name: "Launchpad Control", surface: "admin" },
} as const satisfies Record<AppSurface, { name: string; surface: AppSurface }>;
