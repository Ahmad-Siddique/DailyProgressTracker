-- Reject profile updates where version jumps by anything other than +1.

create or replace function public.enforce_profiles_version_step()
returns trigger
language plpgsql
as $$
begin
  if new.version is distinct from old.version then
    if new.version <> old.version + 1 then
      raise exception 'profile_version_step_invalid';
    end if;
    return new;
  end if;
  if row (
    new.timezone,
    new.theme,
    new.display_name,
    new.reporting_currency,
    new.reminders_enabled,
    new.hide_amounts_on_lock_screen,
    new.saved_chats_enabled,
    new.email
  ) is distinct from row (
    old.timezone,
    old.theme,
    old.display_name,
    old.reporting_currency,
    old.reminders_enabled,
    old.hide_amounts_on_lock_screen,
    old.saved_chats_enabled,
    old.email
  ) then
    raise exception 'profile_version_required';
  end if;
  return new;
end;
$$;

create trigger profiles_version_guard
  before update on public.profiles
  for each row
  execute function public.enforce_profiles_version_step();