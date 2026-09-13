export const AUDIT_ACTIONS=[
 "business.created","business.updated","business.modules_updated","subscription.updated",
 "branch.created","branch.updated","staff.updated","client_admin.updated",
 "client_admin.activated","client_admin.deactivated","client_admin.reset_requested"
] as const;
export type AuditEntry={id:number;business_id:string|null;business_name:string|null;actor_id:string|null;
 actor_email:string|null;action:string;entity_type:string;entity_id:string|null;
 old_values:Record<string,unknown>|null;new_values:Record<string,unknown>|null;occurred_at:string};
export function actionLabel(action:string){return action.split(/[._]/).map(x=>x[0]?.toUpperCase()+x.slice(1)).join(" ")}
