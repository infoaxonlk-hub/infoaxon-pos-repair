export type BusinessReadiness = {
  business_id: string;
  business_name: string;
  business_code: string;
  business_active: boolean;
  profile_complete: boolean;
  branding_complete: boolean;
  subscription_complete: boolean;
  modules_complete: boolean;
  enabled_module_count: number;
  main_branch_complete: boolean;
  active_admin_complete: boolean;
  completed_steps: number;
  total_steps: number;
};

export type ReadinessOverview = {
  business_id: string;
  completed_steps: number;
  total_steps: number;
  ready: boolean;
};
