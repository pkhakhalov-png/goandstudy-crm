-- Повторный созвон: бронь знает свою сделку.
--
-- Первая консультация — бронь с сайта, и сделка ссылается на неё
-- (deals.booking_id). Повторный созвон продажник назначает из карточки
-- сделки: броней у сделки становится несколько, а ссылка в обратную сторону
-- одна. Без deal_id запись второго звонка находила бы сделку по телефону —
-- угадыванием, которое ломается на пустом или общем номере.

begin;

alter table public.bookings
  add column if not exists deal_id uuid references public.deals(id) on delete set null;

comment on column public.bookings.deal_id is
  'Сделка, к которой относится созвон. Заполняется у повторных созвонов из карточки сделки; у первой брони связь — deals.booking_id.';

create index if not exists bookings_deal_idx on public.bookings (deal_id) where deal_id is not null;

-- Повторный созвон Регины уже назначен 21.10 — связываем его сразу.
update public.bookings set deal_id = '67c2eeb6-e87d-488b-9cf1-160d30dffbcf'
 where id = '26500eb6-6e7c-4217-bde7-4e2b67a7eec9' and deal_id is null;

commit;
