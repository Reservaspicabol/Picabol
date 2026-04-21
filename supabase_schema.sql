-- =============================================
-- PICABOL — Esquema de base de datos
-- Ejecutar en Supabase > SQL Editor
-- =============================================

-- Perfiles de usuario (admin / host)
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text check (role in ('admin','host')) default 'host',
  created_at timestamptz default now()
);

-- Reservas
create table if not exists bookings (
  id            bigserial primary key,
  date          date not null,
  hour          smallint not null check (hour between 7 and 21),
  court         smallint not null check (court between 1 and 4),
  modality      text not null check (modality in ('privada','openplay')),
  name          text not null,
  city          text,
  people        smallint default 1,
  gender_m      smallint default 0,
  gender_f      smallint default 0,
  gender_k      smallint default 0,
  notes         text,
  status        text check (status in ('reserved','waiting','playing','finished','cancelled','expired'))
                default 'reserved',
  scheduled_at  timestamptz,
  started_at    timestamptz,
  finished_at   timestamptz,
  extra_minutes smallint default 0,
  revenue       numeric(10,2) default 0,
  created_by    uuid references profiles(id),
  created_at    timestamptz default now()
);

-- Salas Open Play
create table if not exists open_play_rooms (
  id          bigserial primary key,
  booking_id  bigint references bookings(id) on delete cascade,
  organizer   text not null,
  capacity    smallint default 8,
  joined      smallint default 1,
  status      text check (status in ('open','full','playing','finished')) default 'open',
  created_at  timestamptz default now()
);

-- Transacciones de ingreso
create table if not exists transactions (
  id          bigserial primary key,
  booking_id  bigint references bookings(id) on delete set null,
  amount      numeric(10,2) not null,
  method      text check (method in ('efectivo','tarjeta','transferencia','pendiente'))
              default 'efectivo',
  description text,
  created_by  uuid references profiles(id),
  created_at  timestamptz default now()
);

-- =============================================
-- Row Level Security
-- =============================================
alter table profiles          enable row level security;
alter table bookings          enable row level security;
alter table open_play_rooms   enable row level security;
alter table transactions      enable row level security;

-- Profiles: cada usuario ve su propio perfil; admins ven todos
create policy "Own profile" on profiles
  for select using (auth.uid() = id);

create policy "Admin sees all profiles" on profiles
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Bookings: hosts y admins pueden leer/escribir
create policy "Staff bookings" on bookings
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','host'))
  );

-- Open play rooms: staff
create policy "Staff open play" on open_play_rooms
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','host'))
  );

-- Transactions: staff
create policy "Staff transactions" on transactions
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','host'))
  );

-- =============================================
-- Función: crear perfil al registrarse
-- =============================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'host');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
