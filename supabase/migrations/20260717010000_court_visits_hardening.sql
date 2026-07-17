revoke execute on function public.log_court_visit(text, text, text, text) from public;
grant execute on function public.log_court_visit(text, text, text, text) to anon, authenticated;

create or replace function public.log_court_visit(
  p_venue_slug text,
  p_sport text,
  p_court_slug text,
  p_sponsor_slug text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_venue_slug is null or length(p_venue_slug) > 64
     or p_sport is null or length(p_sport) > 32
     or p_court_slug is null or length(p_court_slug) > 64
     or (p_sponsor_slug is not null and length(p_sponsor_slug) > 64) then
    return;
  end if;

  insert into public.court_visits (venue_slug, sport, court_slug, sponsor_slug)
  values (p_venue_slug, p_sport, p_court_slug, p_sponsor_slug);
end;
$$;
