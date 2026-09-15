-- Cor personalizada do território no mapa: quando definida, substitui a cor
-- automática por progresso (ver corDoProgresso em components/Mapa.tsx).

alter table public.territorios add column if not exists cor text;
