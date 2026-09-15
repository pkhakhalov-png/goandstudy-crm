-- Курс из ЦБ как отдельный источник.
--
-- Было: только `manual` и `actual_transfer`. Владелец попросил динамический
-- курс, и брать его будем у ЦБ РФ. Писать такой курс как «manual» нельзя —
-- в отчёте потом не отличить, что человек ввёл руками, а что подтянулось само.
--
-- Ручной курс на ту же дату остаётся главнее автоматического: если владелец
-- вписал своё число, у него была причина.
alter table finance.exchange_rates drop constraint if exists exchange_rates_source_check;
alter table finance.exchange_rates
  add constraint exchange_rates_source_check
  check (source in ('manual', 'cbr', 'actual_transfer'));
