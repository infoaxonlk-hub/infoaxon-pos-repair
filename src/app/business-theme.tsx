import type { CSSProperties, ReactNode } from "react";
import { getBusinessBrand } from "@/lib/branding-server";
import { DEFAULT_PRIMARY, DEFAULT_ACCENT, themeText, luminance, HEX } from "@/lib/branding";

export async function BusinessTheme({ children }: { children: ReactNode }) {
  const brand = await getBusinessBrand();
  if (!brand) return <>{children}</>;
  const primary = HEX.test(brand.primary_color) ? brand.primary_color : DEFAULT_PRIMARY;
  const accent = HEX.test(brand.accent_color) ? brand.accent_color : DEFAULT_ACCENT;
  const foreground = themeText(primary, accent);
  const safePrimary = foreground ? primary : DEFAULT_PRIMARY;
  const safeAccent = foreground ? accent : DEFAULT_ACCENT;
  const style = {
    "--brand-primary": safePrimary,
    "--brand-accent": safeAccent,
    "--brand-foreground": foreground ?? "#ffffff",
    "--brand-link": luminance(safePrimary) <= 0.183 ? safePrimary : "#1e293b",
  } as CSSProperties;
  return <div className="business-theme min-h-full flex-1" style={style}>{children}</div>;
}
