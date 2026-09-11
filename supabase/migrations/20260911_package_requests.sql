-- 20260911_package_requests.sql — 구현 지시서 01(2기) §5-1
--
-- 클래스 Supabase 프로젝트(C2-064)에 테이블 하나를 만든다. 그게 전부다.
-- 1기 테이블·함수·버킷은 손대지 않는다 — 이 파일은 create 만 하고 drop 하지 않는다.
--
-- 실행: 발주자가 Supabase SQL Editor 에 붙여 넣어 1회 실행(S4-5).
-- 보유 데이터(C2-065): email · consented_at · sent_at · ip_hash(해시만) · cta — 그 외 0.

create table if not exists public.package_requests (
  id            uuid primary key default gen_random_uuid(),
  email         text        not null,
  consented_at  timestamptz not null,
  sent_at       timestamptz,                -- NULL = 전송 실패 또는 미전송(§5-3 ⑥)
  ip_hash       text        not null,       -- sha256(salt + IP) · IP 원문은 어디에도 남기지 않는다
  cta           text,                       -- 'A' | 'B' (어느 폼인지) · 그 외 0
  created_at    timestamptz not null default now()
);

-- RLS 활성 · 정책 0 = secret 키를 쥔 서버(Pages Function)만 읽고 쓴다(Q-L-6).
-- 정책을 하나라도 만들면 anon 키로 뚫린다 — 만들지 않는다.
alter table public.package_requests enable row level security;

-- 레이트 리밋 조회(오늘 · 같은 이메일 / 같은 ip_hash)가 쓰는 두 인덱스.
create index if not exists package_requests_email_created_at_idx
  on public.package_requests (email, created_at);
create index if not exists package_requests_ip_hash_created_at_idx
  on public.package_requests (ip_hash, created_at);

-- 적용 확인
--   \d package_requests
--   select relrowsecurity from pg_class where relname = 'package_requests';   -- t
--   select count(*) from pg_policies where tablename = 'package_requests';    -- 0
