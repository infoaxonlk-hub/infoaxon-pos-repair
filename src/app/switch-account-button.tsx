import { LogIn } from "lucide-react";
import { switchToClientLogin } from "@/app/platform/admins/switch-actions";

export function SwitchAccountButton({
  businessId,
  adminId,
  business,
}: {
  businessId: string;
  adminId: string;
  business: string;
}) {
  return (
    <form action={switchToClientLogin} className="mt-4">
      <input type="hidden" name="businessId" value={businessId}/>
      <input type="hidden" name="adminId" value={adminId}/>
      <input type="hidden" name="businessName" value={business}/>
      <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-3 font-semibold text-white">
        <LogIn size={18}/> Login to client system
      </button>
    </form>
  );
}
