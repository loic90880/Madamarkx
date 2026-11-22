CREATE TABLE IF NOT EXISTS platform_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00
);

INSERT INTO platform_settings (id, commission_rate)
VALUES (1, 5.00)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS delivery_rates (
  id SERIAL PRIMARY KEY,
  city TEXT NOT NULL,
  delivery_type TEXT NOT NULL CHECK (delivery_type IN ('DOMICILE', 'POINT_RELAIS')),
  fee BIGINT NOT NULL DEFAULT 0,
  UNIQUE (city, delivery_type)
);

CREATE TABLE IF NOT EXISTS payment_channels (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  requires_proof BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'CLIENT' CHECK (role IN ('CLIENT', 'VENDEUR', 'ADMINISTRATEUR')),
  bio TEXT DEFAULT '',
  note_text TEXT DEFAULT '',
  city_location TEXT DEFAULT 'Mahajanga, Madagascar',
  birthday TEXT DEFAULT '',
  is_profile_locked BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url TEXT DEFAULT '',
  cover_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS note_text TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS city_location TEXT DEFAULT 'Mahajanga, Madagascar';
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_profile_locked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS user_follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS seller_applications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  shop_city TEXT NOT NULL,
  cin_number TEXT DEFAULT '',
  cin_front_url TEXT NOT NULL,
  cin_back_url TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'EN_ATTENTE' CHECK (status IN ('EN_ATTENTE', 'APPROUVEE', 'REJETEE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shops (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT UNIQUE NOT NULL,
  city TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'EN_ATTENTE' CHECK (status IN ('EN_ATTENTE', 'APPROUVEE', 'SUSPENDUE')),
  pending_balance BIGINT NOT NULL DEFAULT 0,
  available_balance BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  shop_name TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  city TEXT NOT NULL,
  price BIGINT NOT NULL,
  promo_price BIGINT,
  stock INTEGER NOT NULL DEFAULT 0,
  rating NUMERIC(2,1) NOT NULL DEFAULT 5.0,
  sales INTEGER NOT NULL DEFAULT 0,
  icon_kind TEXT NOT NULL DEFAULT 'box',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_num TEXT UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  city TEXT NOT NULL,
  delivery_type TEXT NOT NULL,
  address TEXT NOT NULL,
  pay_method TEXT NOT NULL,
  subtotal BIGINT NOT NULL,
  delivery_fee BIGINT NOT NULL,
  total BIGINT NOT NULL,
  pay_status TEXT NOT NULL DEFAULT 'EN_VERIFICATION',
  order_status TEXT NOT NULL DEFAULT 'EN_ATTENTE_PAIEMENT',
  tx_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sub_orders (
  id SERIAL PRIMARY KEY,
  sub_num TEXT UNIQUE NOT NULL,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shop_name TEXT NOT NULL,
  subtotal BIGINT NOT NULL,
  commission_amount BIGINT NOT NULL,
  net_amount BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'EN_ATTENTE_PAIEMENT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_num TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  method TEXT NOT NULL,
  amount BIGINT NOT NULL,
  tx_ref TEXT,
  status TEXT NOT NULL DEFAULT 'EN_VERIFICATION',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DEMANDE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caption TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  shared_from_id INTEGER REFERENCES community_posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS post_likes (
  post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO delivery_rates (city, delivery_type, fee) VALUES
  ('Antananarivo', 'DOMICILE', 6000),
  ('Antananarivo', 'POINT_RELAIS', 3000),
  ('Mahajanga', 'DOMICILE', 12000),
  ('Mahajanga', 'POINT_RELAIS', 7000),
  ('Toamasina', 'DOMICILE', 10000),
  ('Toamasina', 'POINT_RELAIS', 6000),
  ('Antsirabe', 'DOMICILE', 8000),
  ('Antsirabe', 'POINT_RELAIS', 5000),
  ('Fianarantsoa', 'DOMICILE', 12000),
  ('Fianarantsoa', 'POINT_RELAIS', 7000),
  ('Toliara', 'DOMICILE', 15000),
  ('Toliara', 'POINT_RELAIS', 9000),
  ('Antsiranana', 'DOMICILE', 16000),
  ('Antsiranana', 'POINT_RELAIS', 10000)
ON CONFLICT (city, delivery_type) DO NOTHING;

INSERT INTO payment_channels (code, label, account_number, account_holder, requires_proof) VALUES
  ('MVOLA', 'MVola', '034 00 000 00', 'MADAMARKET', TRUE),
  ('ORANGE_MONEY', 'Orange Money', '032 00 000 00', 'MADAMARKET', TRUE),
  ('AIRTEL_MONEY', 'Airtel Money', '033 00 000 00', 'MADAMARKET', TRUE),
  ('VIREMENT_BANCAIRE', 'Virement bancaire', 'BNI MG46 0000 5000 0123 4567 8901 234', 'MADAMARKET', TRUE),
  ('PAIEMENT_LIVRAISON', 'Paiement à la livraison', 'Espèces à la livraison', 'Livreur MadaMarket', FALSE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO products (shop_name, name, category, city, price, promo_price, stock, rating, sales, icon_kind)
SELECT * FROM (VALUES
  ('Comptoir du Nord', 'Vanille Bourbon Noire (250g)', 'Produits Locaux & Artisanat', 'Antsiranana', 65000, 55000, 25, 4.9, 140, 'leaf'),
  ('Tana Tech', 'Smartphone Android 128Go', 'Téléphones & Tablettes', 'Antananarivo', 890000, NULL, 12, 4.6, 95, 'phone'),
  ('Arts de Boeny', 'Panier Tressé Raphia', 'Produits Locaux & Artisanat', 'Mahajanga', 38000, 29000, 40, 4.8, 210, 'bag'),
  ('Rucher Vakinankaratra', 'Miel Naturel Hautes Terres (1kg)', 'Alimentation & Épicerie', 'Antsirabe', 32000, NULL, 30, 4.5, 175, 'box')
) AS seed(shop_name, name, category, city, price, promo_price, stock, rating, sales, icon_kind)
WHERE NOT EXISTS (SELECT 1 FROM products);
