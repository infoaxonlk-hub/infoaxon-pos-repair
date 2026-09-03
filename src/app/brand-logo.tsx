/* eslint-disable @next/next/no-img-element -- public, sanitized small raster logos */
"use client";
import { useState } from "react";

export function BrandLogo({ src, name, className = "h-10 w-10" }: {
  src: string | null; name: string; className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return src && failed !== src ? (
    <img src={src} alt={name + " logo"} onError={() => setFailed(src)}
      className={className + " rounded-xl bg-white object-contain p-1"} width={64} height={64} />
  ) : (
    <span aria-label={name} className={className + " flex shrink-0 items-center justify-center rounded-xl bg-blue-600 font-bold text-white"}>
      {name.trim().slice(0, 2).toUpperCase() || "IA"}
    </span>
  );
}
