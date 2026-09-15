-- =============================================================================
-- Testes das políticas de RLS. Cada caso roda numa transação desfeita no fim,
-- simulando um usuário (auth.uid()) com o papel "authenticated" do Supabase.
-- Rodar com supabase/tests/rls.sh
-- =============================================================================

create schema teste;
grant usage on schema teste to anon, authenticated;

-- Executa o comando e devolve quantas linhas foram afetadas (-1 se deu erro)
create function teste.linhas(comando text)
returns integer
language plpgsql
as $$
declare
  afetadas integer;
begin
  execute comando;
  get diagnostics afetadas = row_count;
  return afetadas;
exception when others then
  return -1;
end
$$;

create function teste.esperar(obtido integer, esperado integer, descricao text)
returns void
language plpgsql
as $$
begin
  if obtido is distinct from esperado then
    raise exception 'FALHOU: % (esperado %, obtido %)', descricao, esperado, obtido;
  end if;
  raise notice 'ok: %', descricao;
end
$$;

create function teste.como(usuario uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', usuario::text, true);
end
$$;

grant execute on all functions in schema teste to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Dados de teste
--   a1 admin · b1 ST · c1 SG do território 1 · c2 SG sem território
--   d1 e d2 dirigentes · e1 admin desativado
-- -----------------------------------------------------------------------------

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000000e1');

-- Todo mundo na mesma congregação "C1" — deixa os testes que já existiam
-- (nada a ver com isolamento por congregação) se comportando exatamente
-- como antes dessa feature existir. Os testes de isolamento, mais abaixo,
-- mexem em congregação pontualmente dentro do próprio bloco/transação.
insert into public.usuarios (id, nome, email, perfil, ativo, congregacao) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', 'admin@teste', 'admin', true, 'C1'),
  ('00000000-0000-0000-0000-0000000000b1', 'ST', 'st@teste', 'superintendente_territorio', true, 'C1'),
  ('00000000-0000-0000-0000-0000000000c1', 'SG 1', 'sg1@teste', 'superintendente_grupo', true, 'C1'),
  ('00000000-0000-0000-0000-0000000000c2', 'SG 2', 'sg2@teste', 'superintendente_grupo', true, 'C1'),
  ('00000000-0000-0000-0000-0000000000d1', 'Dirigente 1', 'd1@teste', 'dirigente', true, 'C1'),
  ('00000000-0000-0000-0000-0000000000d2', 'Dirigente 2', 'd2@teste', 'dirigente', true, 'C1'),
  ('00000000-0000-0000-0000-0000000000e1', 'Admin inativo', 'inativo@teste', 'admin', false, 'C1');

insert into public.territorios (id, nome, numero, congregacao) values
  ('10000000-0000-0000-0000-000000000001', 'Território 1', '1', 'C1'),
  ('10000000-0000-0000-0000-000000000002', 'Território 2', '2', 'C1');

insert into public.quadras (id, territorio_id, nome) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Quadra 1'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Quadra 2');

insert into public.designacoes (usuario_id, territorio_id) values
  ('00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001');

insert into public.marcacoes (id, quadra_id, usuario_id, status) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'concluido'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', 'concluido');

insert into public.pontos_parada (id, quadra_id, usuario_id, lat, lng) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', -6.5, -49.8);

-- -----------------------------------------------------------------------------
-- usuarios
-- -----------------------------------------------------------------------------

begin;
select teste.como('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select teste.esperar(teste.linhas($$update public.usuarios set perfil = 'admin' where id = '00000000-0000-0000-0000-0000000000d1'$$), 0, 'dirigente não consegue virar admin');
select teste.esperar(teste.linhas($$select * from public.usuarios$$), 7, 'dirigente enxerga a lista de usuários');
select teste.esperar(teste.linhas($$delete from public.usuarios where id = '00000000-0000-0000-0000-0000000000d2'$$), 0, 'dirigente não apaga usuário');
rollback;

begin;
select teste.como('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select teste.esperar(teste.linhas($$update public.usuarios set ativo = false where id = '00000000-0000-0000-0000-0000000000d2'$$), 1, 'admin desativa usuário');
rollback;

begin;
select teste.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select teste.esperar(teste.linhas($$select * from public.usuarios$$), 1, 'usuário desativado só enxerga o próprio cadastro');
select teste.esperar(teste.linhas($$select * from public.territorios$$), 0, 'usuário desativado não enxerga territórios');
select teste.esperar(teste.linhas($$insert into public.territorios (nome, numero) values ('X', '99')$$), -1, 'admin desativado não cria território');
rollback;

begin;
set local role anon;
select teste.esperar(teste.linhas($$select * from public.territorios$$), 0, 'visitante sem login não enxerga territórios');
rollback;

-- -----------------------------------------------------------------------------
-- configuracoes
-- -----------------------------------------------------------------------------

begin;
select teste.como('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select teste.esperar(teste.linhas($$select * from public.configuracoes$$), 1, 'dirigente lê configurações');
rollback;

begin;
select teste.como('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select teste.esperar(teste.linhas($$update public.configuracoes set prazo_territorio_dias = 90$$), 0, 'ST não altera configurações');
rollback;

begin;
select teste.como('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select teste.esperar(teste.linhas($$insert into public.configuracoes (id, prazo_territorio_dias) values (1, 90) on conflict (id) do update set prazo_territorio_dias = excluded.prazo_territorio_dias$$), 1, 'admin salva configurações (upsert)');
rollback;

-- -----------------------------------------------------------------------------
-- territorios e quadras
-- -----------------------------------------------------------------------------

begin;
select teste.como('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select teste.esperar(teste.linhas($$insert into public.territorios (nome, numero) values ('X', '99')$$), -1, 'dirigente não cria território');
select teste.esperar(teste.linhas($$delete from public.territorios$$), 0, 'dirigente não apaga território');
select teste.esperar(teste.linhas($$insert into public.quadras (territorio_id, nome) values ('10000000-0000-0000-0000-000000000001', 'Nova')$$), -1, 'dirigente não cria quadra');
select teste.esperar(teste.linhas($$update public.quadras set status = 'concluido', lados = '[{"status":"concluido"}]' where id = '20000000-0000-0000-0000-000000000001'$$), 1, 'dirigente marca status e lados da quadra');
select teste.esperar(teste.linhas($$update public.quadras set geojson = '{}' where id = '20000000-0000-0000-0000-000000000001'$$), -1, 'dirigente não altera contorno da quadra');
select teste.esperar(teste.linhas($$update public.quadras set territorio_id = '10000000-0000-0000-0000-000000000002' where id = '20000000-0000-0000-0000-000000000001'$$), -1, 'dirigente não muda quadra de território');
rollback;

begin;
select teste.como('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select teste.esperar(teste.linhas($$insert into public.territorios (nome, numero, publicadores, familias, link_maps, congregacao) values ('Novo', '38', 3, 2, 'https://goo.gl/maps/x', 'C1')$$), 1, 'ST cria território com publicadores, famílias e link');
select teste.esperar(teste.linhas($$update public.quadras set nome = 'Quadra A', geojson = '{}' where id = '20000000-0000-0000-0000-000000000001'$$), 1, 'ST altera nome e contorno da quadra');
select teste.esperar(teste.linhas($$delete from public.territorios where id = '10000000-0000-0000-0000-000000000002'$$), 1, 'ST apaga território');
rollback;

begin;
select teste.esperar(teste.linhas($$update public.quadras set geojson = '{}' where id = '20000000-0000-0000-0000-000000000001'$$), 1, 'service role/postgres ignora a trava de campos');
rollback;

-- -----------------------------------------------------------------------------
-- isolamento por congregação
--   Território 3 fica numa congregação diferente ("C2") de todo o resto
--   dos fixtures ("C1"), só dentro dos blocos abaixo.
-- -----------------------------------------------------------------------------

begin;
insert into public.territorios (id, nome, numero, congregacao) values
  ('10000000-0000-0000-0000-000000000003', 'Território 3', '3', 'C2');
select teste.como('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select teste.esperar(teste.linhas($$select * from public.territorios$$), 2, 'dirigente da C1 só vê territórios da própria congregação');
rollback;

begin;
insert into public.territorios (id, nome, numero, congregacao) values
  ('10000000-0000-0000-0000-000000000003', 'Território 3', '3', 'C2');
select teste.como('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select teste.esperar(teste.linhas($$select * from public.territorios$$), 3, 'admin vê territórios de todas as congregações');
rollback;

begin;
update public.usuarios set congregacao = null where id = '00000000-0000-0000-0000-0000000000d1';
select teste.como('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select teste.esperar(teste.linhas($$select * from public.territorios$$), 0, 'usuário sem congregação preenchida não vê nenhum território');
rollback;

begin;
insert into public.territorios (id, nome, numero, congregacao) values
  ('10000000-0000-0000-0000-000000000003', 'Território 3', '3', 'C2');
insert into public.quadras (id, territorio_id, nome) values
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Quadra 3');
select teste.como('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select teste.esperar(teste.linhas($$select * from public.quadras$$), 2, 'dirigente da C1 não vê quadra de território de outra congregação');
select teste.esperar(teste.linhas($$update public.quadras set status = 'concluido' where id = '20000000-0000-0000-0000-000000000003'$$), 0, 'dirigente não marca quadra de outra congregação');
rollback;

begin;
insert into public.territorios (id, nome, numero, congregacao) values
  ('10000000-0000-0000-0000-000000000003', 'Território 3', '3', 'C2');
select teste.como('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select teste.esperar(teste.linhas($$insert into public.territorios (nome, numero, congregacao) values ('Y', '77', 'C2')$$), -1, 'ST não cria território em congregação diferente da própria');
select teste.esperar(teste.linhas($$delete from public.territorios where id = '10000000-0000-0000-0000-000000000003'$$), 0, 'ST não apaga território de outra congregação');
rollback;

-- -----------------------------------------------------------------------------
-- designacoes
-- -----------------------------------------------------------------------------

begin;
select teste.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select teste.esperar(teste.linhas($$insert into public.designacoes (usuario_id, territorio_id, quadra_id) values ('00000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')$$), 1, 'SG designa dirigente a quadra do território dele');
select teste.esperar(teste.linhas($$insert into public.designacoes (usuario_id, territorio_id, quadra_id) values ('00000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002')$$), -1, 'SG não designa em território de outro');
select teste.esperar(teste.linhas($$insert into public.designacoes (usuario_id, territorio_id, quadra_id) values ('00000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')$$), -1, 'SG não designa outro SG a quadra');
select teste.esperar(teste.linhas($$insert into public.designacoes (usuario_id, territorio_id) values ('00000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-000000000002')$$), -1, 'SG não designa SG a território');
select teste.esperar(teste.linhas($$update public.designacoes set data_fim = current_date where usuario_id = '00000000-0000-0000-0000-0000000000c1'$$), 0, 'SG não encerra a própria designação de território');
rollback;

begin;
select teste.como('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select teste.esperar(teste.linhas($$insert into public.designacoes (usuario_id, territorio_id) values ('00000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-000000000002')$$), 1, 'ST designa SG a território');
select teste.esperar(teste.linhas($$update public.designacoes set data_fim = current_date where usuario_id = '00000000-0000-0000-0000-0000000000c1'$$), 1, 'ST encerra designação');
rollback;

begin;
select teste.como('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select teste.esperar(teste.linhas($$insert into public.designacoes (usuario_id, territorio_id, quadra_id) values ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')$$), -1, 'dirigente não se designa');
rollback;

-- -----------------------------------------------------------------------------
-- marcacoes
-- -----------------------------------------------------------------------------

begin;
select teste.como('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select teste.esperar(teste.linhas($$insert into public.marcacoes (quadra_id, usuario_id, status) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'parcial')$$), 1, 'dirigente registra marcação própria');
select teste.esperar(teste.linhas($$insert into public.marcacoes (quadra_id, usuario_id, status) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d2', 'parcial')$$), -1, 'dirigente não registra marcação em nome de outro');
select teste.esperar(teste.linhas($$insert into public.marcacoes (quadra_id, usuario_id, status, validado_por) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'parcial', '00000000-0000-0000-0000-0000000000d1')$$), -1, 'dirigente não cria marcação já validada');
select teste.esperar(teste.linhas($$update public.marcacoes set validado_por = '00000000-0000-0000-0000-0000000000d1'$$), 0, 'dirigente não valida marcações');
select teste.esperar(teste.linhas($$delete from public.marcacoes$$), 0, 'dirigente não rejeita marcações');
rollback;

begin;
select teste.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select teste.esperar(teste.linhas($$update public.marcacoes set validado_por = '00000000-0000-0000-0000-0000000000c1' where id = '30000000-0000-0000-0000-000000000001'$$), 1, 'SG valida marcação do território dele');
select teste.esperar(teste.linhas($$update public.marcacoes set validado_por = '00000000-0000-0000-0000-0000000000c1' where id = '30000000-0000-0000-0000-000000000002'$$), 0, 'SG não valida marcação de outro território');
select teste.esperar(teste.linhas($$update public.marcacoes set validado_por = '00000000-0000-0000-0000-0000000000a1' where id = '30000000-0000-0000-0000-000000000001'$$), -1, 'SG não valida em nome de outra pessoa');
select teste.esperar(teste.linhas($$delete from public.marcacoes where id = '30000000-0000-0000-0000-000000000002'$$), 0, 'SG não rejeita marcação de outro território');
select teste.esperar(teste.linhas($$delete from public.marcacoes where id = '30000000-0000-0000-0000-000000000001'$$), 1, 'SG rejeita marcação do território dele');
rollback;

begin;
select teste.como('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select teste.esperar(teste.linhas($$update public.marcacoes set validado_por = '00000000-0000-0000-0000-0000000000c2'$$), 0, 'SG sem território não valida nada');
rollback;

begin;
select teste.como('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select teste.esperar(teste.linhas($$update public.marcacoes set validado_por = '00000000-0000-0000-0000-0000000000b1'$$), 2, 'ST valida qualquer marcação');
rollback;

-- -----------------------------------------------------------------------------
-- pontos_parada
-- -----------------------------------------------------------------------------

begin;
select teste.como('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select teste.esperar(teste.linhas($$update public.pontos_parada set observacao = 'x'$$), 0, 'dirigente não edita ponto de outro');
select teste.esperar(teste.linhas($$delete from public.pontos_parada$$), 0, 'dirigente não apaga ponto de outro');
select teste.esperar(teste.linhas($$insert into public.pontos_parada (quadra_id, usuario_id, lat, lng) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 0, 0)$$), -1, 'dirigente não registra ponto em nome de outro');
rollback;

begin;
select teste.como('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select teste.esperar(teste.linhas($$update public.pontos_parada set observacao = 'casa azul'$$), 1, 'autor edita o próprio ponto');
select teste.esperar(teste.linhas($$delete from public.pontos_parada$$), 1, 'autor apaga o próprio ponto');
rollback;

begin;
select teste.como('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select teste.esperar(teste.linhas($$delete from public.pontos_parada$$), 1, 'ST apaga ponto de qualquer um');
rollback;
