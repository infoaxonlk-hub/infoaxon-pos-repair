"use client";

import { LogIn } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SwitchAccountButton({
  email,
  business,
}: {
  email: string;
  business: string;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function switchAccount() {
    if (switching) return;
    setSwitching(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    const query = new URLSearchParams({ email, business, role: "Client Admin" });
    router.push(`/login?${query.toString()}`);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={switchAccount}
      disabled={switching}
      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
    >
      <LogIn size={18} />
      {switching ? "Opening login…" : "Login to client system"}
    </button>
  );
}
