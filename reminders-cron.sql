-- ============================================================================
-- LarpersCRM — Schedule the send-reminders Edge Function
-- Run in Supabase SQL Editor AFTER you've deployed the function and set secrets.
--
-- This uses pg_cron (to schedule) + pg_net (to make the HTTP call). Both are
-- available on Supabase — enable them once via the Dashboard (Database >
-- Extensions) or the statements below.
--
-- Replace the two placeholders before running:
--   <YOUR-PROJECT-REF>   e.g. eristkfqgiaojcyqznom
--   <YOUR-CRON-SECRET>   the same value you set as the CRON_SECRET function secret
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Run every 15 minutes. Adjust the cron expression to taste.
select cron.schedule(
  'larperscrm-send-reminders',
  '*/15 * * * *',
  $$
    select net.http_post(
      url     := 'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', '<YOUR-CRON-SECRET>'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- To change the schedule later, unschedule then re-run the block above:
--   select cron.unschedule('larperscrm-send-reminders');
--
-- To watch runs:
--   select * from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'larperscrm-send-reminders')
--   order by start_time desc limit 20;
