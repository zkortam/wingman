with source as (
  select
    value as index,
    ('OPP-' || (1000 + value)::text) as id,
    (array['Brightwell Foods','Castellan Logistics','Merrow Health','Padgett Legal','Northstar Materials','Juniper Systems','Albion Freight','Calder Medical'])[((value - 1) % 8) + 1] as account,
    (array['Amina Yusuf','Ben Carter','Clara Reyes','Dev Patel','Elena Park','Finn Lewis','Gia Chen','Hugo Silva'])[((value - 1) % 8) + 1] as owner,
    (array['Discovery','Qualified','Negotiation','Closed Won','Closed Lost'])[((value - 1) % 5) + 1] as stage
  from generate_series(1, 50) as value
)
insert into demo_opportunities (id, account, owner, stage, amount, close_date, status)
select
  id,
  account,
  owner,
  stage,
  4217 + ((index * 7913) % 305700),
  current_date + (index - 25),
  case when index <= 3 then 'New' else 'Active' end
from source;
