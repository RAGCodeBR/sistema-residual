begin;
alter table public.proposals drop constraint proposals_template_check,
  add constraint proposals_template_check check (
    template in ('residuos_peso', 'residuos_cacamba', 'residuos_classe_i', 'assessoria')
  );
commit;
