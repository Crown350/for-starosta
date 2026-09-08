-- Application calls only public.starosta_state; GraphQL is unused.
begin;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on schema graphql_public from public, anon, authenticated;
revoke execute on all functions in schema graphql_public from public, anon, authenticated;
-- This explicit PostgREST role override takes precedence over Dashboard schemas.
-- To return schema management to Dashboard: ALTER ROLE authenticator RESET pgrst.db_schemas.
alter role authenticator set pgrst.db_schemas = 'public';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
