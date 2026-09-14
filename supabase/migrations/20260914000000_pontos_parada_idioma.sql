-- Marca pontos de parada onde mora gente que fala outro idioma (ex:
-- espanhol, libras), com a quantidade de pessoas — pra ST e SG conseguirem
-- ver quantos e onde há esses casos por território/quadra.

alter table public.pontos_parada add column if not exists idioma text;
alter table public.pontos_parada add column if not exists qtd_pessoas integer;
