import { resolveWidgetInstallEnvironment } from "@djay/shared/widget-install";

export const tenantWidgetInstallEnvironment = resolveWidgetInstallEnvironment({
  apiOrigin: process.env.NEXT_PUBLIC_API_APP_URL,
  cdnOrigin: process.env.NEXT_PUBLIC_WIDGET_CDN_URL,
  production: process.env.NODE_ENV === "production",
});
