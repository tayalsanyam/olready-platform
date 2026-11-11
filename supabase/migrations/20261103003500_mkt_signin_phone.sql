-- A number given at sign-in also lands in Numbers to call, and visitors get three chat answers before the number is asked for.
alter table mkt.captures drop constraint if exists captures_source_check;
alter table mkt.captures add constraint captures_source_check check (source in ('slip', 'exit', 'chat', 'shortlist', 'dock', 'signup'));
update mkt.settings set value = '3' where key = 'visitor_ai_free' and value = '2';
