begin;

-- Shared figures used by the dashboard and the main reports page.
create or replace view public.business_dashboard_summary
with (security_invoker = true) as
select
  b.id as business_id,
  coalesce((select sum(ps.grand_total)
    from public.pos_sales ps
    where ps.business_id = b.id
      and ps.sale_date::date = current_date
      and ps.status in ('completed','partially_refunded','refunded')), 0)::numeric(14,2) as today_pos_sales,
  coalesce((select sum(rj.grand_total)
    from public.repair_jobs rj
    where rj.business_id = b.id
      and rj.created_at::date = current_date
      and rj.status <> 'cancelled'), 0)::numeric(14,2) as today_repair_income,
  coalesce((select sum(e.total_amount)
    from public.expenses e
    where e.business_id = b.id
      and e.expense_date = current_date
      and e.status = 'paid'), 0)::numeric(14,2) as today_expenses,
  (select count(*) from public.repair_jobs rj
    where rj.business_id = b.id
      and rj.status not in ('delivered','cancelled'))::integer as open_repairs,
  (select count(*) from public.products p
    where p.business_id = b.id and p.active and p.product_type = 'stockable'
      and coalesce((select sum(sb.quantity) from public.stock_balances sb
                    where sb.business_id = b.id and sb.product_id = p.id),0) <= p.minimum_stock)::integer as low_stock_items,
  coalesce((select sum(cos.outstanding) from public.customer_outstanding_summary cos
    where cos.business_id = b.id),0)::numeric(14,2) as customer_outstanding,
  coalesce((select sum(sos.outstanding) from public.supplier_outstanding_summary sos
    where sos.business_id = b.id),0)::numeric(14,2) as supplier_outstanding
from public.businesses b;

create or replace view public.daily_business_performance
with (security_invoker = true) as
select
  days.business_id,
  days.report_date,
  coalesce(s.sales,0)::numeric(14,2) as pos_sales,
  coalesce(r.repairs,0)::numeric(14,2) as repair_income,
  coalesce(e.expenses,0)::numeric(14,2) as expenses,
  (coalesce(s.sales,0) + coalesce(r.repairs,0) - coalesce(e.expenses,0))::numeric(14,2) as net_result
from (
  select business_id, sale_date::date report_date from public.pos_sales
  union
  select business_id, created_at::date from public.repair_jobs
  union
  select business_id, expense_date from public.expenses
) days
left join (
  select business_id, sale_date::date report_date, sum(grand_total) sales
  from public.pos_sales where status in ('completed','partially_refunded','refunded')
  group by business_id, sale_date::date
) s using (business_id,report_date)
left join (
  select business_id, created_at::date report_date, sum(grand_total) repairs
  from public.repair_jobs where status <> 'cancelled'
  group by business_id, created_at::date
) r using (business_id,report_date)
left join (
  select business_id, expense_date report_date, sum(total_amount) expenses
  from public.expenses where status = 'paid'
  group by business_id, expense_date
) e using (business_id,report_date);

create or replace view public.product_sales_summary
with (security_invoker = true) as
select
  p.business_id,
  p.id as product_id,
  p.sku,
  p.name,
  coalesce(sum(psl.quantity - psl.returned_quantity),0)::numeric(14,3) as quantity_sold,
  coalesce(sum(psl.line_total),0)::numeric(14,2) as sales_value,
  coalesce(sum((psl.quantity - psl.returned_quantity) * psl.unit_cost),0)::numeric(14,2) as cost_value,
  coalesce(sum(psl.line_total - ((psl.quantity - psl.returned_quantity) * psl.unit_cost)),0)::numeric(14,2) as gross_profit
from public.products p
left join public.pos_sale_lines psl on psl.product_id = p.id and psl.business_id = p.business_id
left join public.pos_sales ps on ps.id = psl.sale_id
  and ps.status in ('completed','partially_refunded','refunded')
group by p.business_id,p.id,p.sku,p.name;

grant select on public.business_dashboard_summary,
  public.daily_business_performance,
  public.product_sales_summary to authenticated;

commit;
