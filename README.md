# React + Vite

## TAFI Accountant accounts

Run `supabase/accountant_management.sql` in the Supabase SQL Editor after
`supabase/super_admin_login.sql` and `supabase/tafi_admin_management.sql`.
This sets up TAFI Accountant accounts and their inventory information table.
Super Admins can create Accountant accounts; signed-in Accountants can add and
view inventory entries in the Accountant Dashboard.

## Attendance period access mode

Run `supabase/attendance_period_access_mode.sql` after
`supabase/attendance_period_controls.sql`. TAFI Admins can then choose weekly
or daily attendance access for each branch in the Period Access section. Daily
periods open for the current day and lock automatically after the day ends.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
