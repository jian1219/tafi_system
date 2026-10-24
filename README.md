# React + Vite

## TAFI Accountant accounts

Run `supabase/accountant_management.sql` in the Supabase SQL Editor after
`supabase/super_admin_login.sql` and `supabase/tafi_admin_management.sql`.
This sets up TAFI Accountant accounts and their inventory information table.
Super Admins can create Accountant accounts; signed-in Accountants can add and
view inventory entries in the Accountant Dashboard. To let Accountants view
TAFI and Branch stock, run `supabase/tafi_stock_inventory.sql` after
`supabase/tafi_admin_inventory.sql`, then run `supabase/branch_inventory.sql`
after `supabase/branch_management.sql`, `supabase/tafi_admin_management.sql`,
`supabase/tafi_stock_inventory.sql`, and `supabase/accountant_management.sql`.

## Branch daily inventory usage

Run the updated `supabase/branch_inventory.sql` after
`supabase/branch_management.sql`, `supabase/tafi_admin_management.sql`,
`supabase/tafi_stock_inventory.sql`, and `supabase/accountant_management.sql`.
Branch Admins can record each item's usage for the current day in the Daily
Inventory Log. The first beginning stock uses Branch Inventory's available
quantity; following days carry forward the previous day's ending stock. Saving
usage updates Branch Inventory automatically, and the Daily Usage History
section lets Branch Admins review saved entries by date. The Monthly Usage tab
summarizes each inventory item's total usage for a selected month. Re-run the
updated script to migrate Branch Inventory to a single Available quantity,
preserve existing available balances, create the daily log table, and update
its session-checked RPCs. Re-run `supabase/stock_request_delivery_receipt.sql`
afterward so received stock adds to Available.
Then run `supabase/branch_stock_request_batches.sql` and
`supabase/tafi_admin_deliver_stock_requests_by_branch_date.sql` so TAFI Admins
can mark all pending requests for one branch and Manila request date delivered
in a single transaction.
TAFI Admins can use the Branch Usage Log in the TAFI Dashboard to select a
branch and review its daily usage history or monthly usage totals.
Accountants can use the Branch Usage Log in the Accountant Dashboard to review
the same reports by branch. Re-run the updated script to install the
Accountant-authorized reporting functions.

## Attendance period access mode

Run `supabase/attendance_period_access_mode.sql` after
`supabase/attendance_period_controls.sql`. TAFI Admins can then choose weekly
or daily attendance access for each branch in the Period Access section. Daily
periods open for the current day and lock automatically after the day ends.

## Sick leave and emergency leave attendance

Run `supabase/attendance_sick_emergency_leave.sql` after
`supabase/branch_employee_contributions.sql` and
`supabase/tafi_admin_management.sql`. Branch and TAFI Admins can then record
Sick Leave (SL) and Emergency Leave (EL) in Daily Attendance; the statuses
appear with rose and orange colors in attendance records.

## Branch Admin filed employee leave

After `supabase/branch_employee_contributions.sql`,
`supabase/branch_employee_leave_credits.sql`, and
`supabase/tafi_admin_management.sql` are installed, run
`supabase/attendance_sick_emergency_leave.sql` and then
`supabase/branch_employee_filed_leave_requests.sql`. Branch and TAFI Admins can
file leave for active employees in their branch selection with one or more PDF
forms. Filing immediately adds the selected leave status to Daily Attendance
for every date in the request. Vacation Leave with Pay is limited to Regular
employees with enough available credits; other leave types do not use credits.
The new leave rows are locked from attendance status changes.

## Branch Admin employee records

Run `supabase/branch_employee_documents.sql` after
`supabase/branch_management.sql` and `supabase/tafi_employee_documents.sql`.
Branch Admins can upload, view, and download incident reports, investigation
reports, employee contracts, and employee evaluations for employees in their
assigned branch. These records are also visible to TAFI Admins.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
