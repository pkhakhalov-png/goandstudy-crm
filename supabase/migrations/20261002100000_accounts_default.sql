-- Основной счёт валюты.
--
-- Зачем. Бот выбирал счёт правилом «единственный в своей валюте». Пока
-- рублёвый счёт был один, правило работало незаметно. 2 октября появилась
-- «Копилка» — тоже рублёвая, — и правило перестало давать ответ: бот на четыре
-- операции подряд ответил «Записано 0 из 4. На какой счёт записать?».
--
-- Признак явный, а не «самый старый счёт»: неявное правило однажды выберет не
-- то, и объяснить это будет нечем.

alter table finance.accounts
  add column if not exists is_default boolean not null default false;

comment on column finance.accounts.is_default is
  'Куда записывать, если счёт в сообщении не назван. По одному на валюту.';

-- По одному основному на валюту: иначе выбор снова станет неоднозначным.
create unique index if not exists accounts_one_default_per_currency
  on finance.accounts (currency) where is_default;

-- Т-Банк и TBC были единственными в своих валютах до появления «Копилки» —
-- значит бот и так писал туда. Закрепляем сложившееся поведение.
update finance.accounts set is_default = true
where name in ('Т-Банк', 'TBC') and archived_at is null;
