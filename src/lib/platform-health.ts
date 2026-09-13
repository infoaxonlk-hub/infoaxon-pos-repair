export type PlatformHealthIssue = {
  issue_code: string;
  severity: "critical" | "warning";
  business_id: string;
  business_name: string;
  business_code: string;
  detail: string;
  action_path: string;
};
