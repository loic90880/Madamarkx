const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

const ADMIN_EMAIL = 'loic90880@gmail.com';
const ADMIN_PASS = '290402';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:5432/madamarket'
});

app.use(cors());
app.use(express.json({ limit: '25mb' }));

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(String(pwd)).digest('hex');
}

async function ensureAdminAccount() {
  const adminHash = hashPassword(ADMIN_PASS);
  const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [ADMIN_EMAIL]);
  if (existing.rows.length) {
    await pool.query(
      "UPDATE users SET role = 'ADMINISTRATEUR', password_hash = $1 WHERE id = $2",
      [adminHash, existing.rows[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO users (full_name, phone, email, password_hash, role, city_location)
       VALUES ($1,$2,$3,$4,'ADMINISTRATEUR','Mahajanga, Madagascar')`,
      ['Loïc Administrateur', '034 00 000 00', ADMIN_EMAIL, adminHash]
    );
  }
}

async function fetchStories() {
  const r = await pool.query(`
    SELECT s.id, s.user_id AS "userId", s.photo_url AS "photoUrl", s.caption, s.created_at AS "createdAt",
           u.full_name AS "authorName", u.avatar_url AS "authorAvatar"
    FROM stories s
    JOIN users u ON u.id = s.user_id
    ORDER BY s.id DESC
    LIMIT 30
  `);
  return r.rows;
}

async function fetchPosts(viewerUserId = null) {
  const postsRes = await pool.query(`
    SELECT
      p.id,
      p.user_id AS "userId",
      p.caption,
      p.photo_url AS "photoUrl",
      p.is_anonymous AS "isAnonymous",
      p.shared_from_id AS "sharedFromId",
      p.created_at AS "createdAt",
      u.full_name AS "authorName",
      u.role AS "authorRole",
      u.avatar_url AS "authorAvatar",
      sp.caption AS "sharedCaption",
      sp.photo_url AS "sharedPhotoUrl",
      su.id AS "sharedAuthorId",
      su.full_name AS "sharedAuthorName",
      (SELECT COUNT(*)::int FROM post_likes l WHERE l.post_id = p.id) AS "likesCount",
      (SELECT COUNT(*)::int FROM community_posts sh WHERE sh.shared_from_id = p.id) AS "sharesCount",
      ${viewerUserId ? 'EXISTS(SELECT 1 FROM post_likes l2 WHERE l2.post_id = p.id AND l2.user_id = $1)' : 'FALSE'} AS "likedByMe"
    FROM community_posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN community_posts sp ON sp.id = p.shared_from_id
    LEFT JOIN users su ON su.id = sp.user_id
    ORDER BY p.id DESC
  `, viewerUserId ? [Number(viewerUserId)] : []);

  const commentsRes = await pool.query(`
    SELECT
      c.id,
      c.post_id AS "postId",
      c.user_id AS "userId",
      c.content,
      c.created_at AS "createdAt",
      u.full_name AS "authorName",
      u.avatar_url AS "authorAvatar"
    FROM post_comments c
    JOIN users u ON u.id = c.user_id
    ORDER BY c.id ASC
  `);

  const byPost = {};
  for (const c of commentsRes.rows) {
    if (!byPost[c.postId]) byPost[c.postId] = [];
    byPost[c.postId].push(c);
  }

  return postsRes.rows.map(p => ({
    ...p,
    comments: byPost[p.id] || []
  }));
}

async function fetchSellerApplications() {
  const r = await pool.query(`
    SELECT
      a.id,
      a.user_id AS "userId",
      a.full_name AS "fullName",
      a.phone,
      a.address,
      a.shop_name AS "shopName",
      a.shop_city AS "shopCity",
      a.cin_number AS "cinNumber",
      a.cin_front_url AS "cinFrontUrl",
      a.cin_back_url AS "cinBackUrl",
      a.notes,
      a.status,
      a.created_at AS "createdAt",
      u.email AS "userEmail"
    FROM seller_applications a
    JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC
  `);
  return r.rows;
}

app.get('/api/bootstrap', async (req, res) => {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const [settingsRes, ratesRes, channelsRes, prodsRes, ordersRes, subsRes, shopsRes, paysRes, posts, stories, usersRes, apps] = await Promise.all([
      pool.query('SELECT commission_rate FROM platform_settings WHERE id = 1'),
      pool.query('SELECT id, city, delivery_type AS "deliveryType", fee::float FROM delivery_rates ORDER BY id ASC'),
      pool.query('SELECT id, code, label, account_number AS "accountNumber", account_holder AS "accountHolder", requires_proof AS "requiresProof" FROM payment_channels ORDER BY id ASC'),
      pool.query('SELECT id, shop_name AS shop, name, category, city, price::float, promo_price::float AS promo, stock, rating::float, sales, icon_kind AS emoji FROM products ORDER BY id DESC'),
      pool.query('SELECT id, order_num AS "orderNum", user_id AS "userId", customer_name AS customer, customer_phone AS phone, city, delivery_type AS "deliveryType", address, pay_method AS method, total::float, pay_status AS "payStatus", order_status AS "orderStatus", tx_ref AS "txRef" FROM orders ORDER BY id DESC'),
      pool.query('SELECT id, sub_num AS "subNum", order_id AS "orderId", shop_name AS shop, subtotal::float AS sub, commission_amount::float AS comm, net_amount::float AS net, status FROM sub_orders ORDER BY id DESC'),
      pool.query('SELECT id, owner_user_id AS "ownerUserId", name, city, owner_name AS owner, status, pending_balance::float AS pending, available_balance::float AS available FROM shops ORDER BY id ASC'),
      pool.query('SELECT id, order_id AS "orderId", order_num AS "orderNum", customer_name AS customer, method, amount::float, tx_ref AS "txRef", status FROM payments ORDER BY id DESC'),
      fetchPosts(userId),
      fetchStories(),
      pool.query(`SELECT id, full_name AS "fullName", role, bio, note_text AS "noteText", city_location AS "cityLocation", birthday, is_profile_locked AS "isProfileLocked", avatar_url AS "avatarUrl", cover_url AS "coverUrl" FROM users ORDER BY id ASC`),
      fetchSellerApplications()
    ]);

    let unreadMessages = 0;
    if (userId) {
      const uMsg = await pool.query('SELECT COUNT(*)::int AS cnt FROM messages WHERE receiver_id = $1 AND is_read = FALSE', [userId]);
      unreadMessages = uMsg.rows[0]?.cnt || 0;
    }

    res.json({
      commissionRate: Number(settingsRes.rows[0]?.commission_rate ?? 5),
      deliveryRates: ratesRes.rows,
      paymentChannels: channelsRes.rows,
      products: prodsRes.rows,
      orders: ordersRes.rows,
      sellerOrders: subsRes.rows,
      shops: shopsRes.rows,
      payments: paysRes.rows,
      posts,
      stories,
      members: usersRes.rows,
      sellerApplications: apps,
      unreadMessages
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur base de données' });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { fullName, phone, email, password, cityLocation, birthday } = req.body;
    if (!fullName || !phone || !email || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const role = String(email).trim().toLowerCase() === ADMIN_EMAIL ? 'ADMINISTRATEUR' : 'CLIENT';

    const uRes = await pool.query(
      `INSERT INTO users (full_name, phone, email, password_hash, role, city_location, birthday)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, full_name AS "fullName", phone, email, role, bio, note_text AS "noteText", city_location AS "cityLocation", birthday, is_profile_locked AS "isProfileLocked", avatar_url AS "avatarUrl", cover_url AS "coverUrl"`,
      [fullName, phone, email, hashPassword(password), role, cityLocation || 'Mahajanga, Madagascar', birthday || '']
    );

    res.status(201).json({ user: uRes.rows[0], shop: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l’inscription' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    await ensureAdminAccount();
    const { identifier, password } = req.body;
    const uRes = await pool.query(
      `SELECT id, full_name AS "fullName", phone, email, role, bio, note_text AS "noteText", city_location AS "cityLocation", birthday, is_profile_locked AS "isProfileLocked", avatar_url AS "avatarUrl", cover_url AS "coverUrl"
       FROM users
       WHERE (LOWER(email) = LOWER($1) OR phone = $1) AND password_hash = $2`,
      [identifier, hashPassword(password)]
    );
    if (!uRes.rows.length) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const user = uRes.rows[0];
    const sRes = await pool.query(
      `SELECT id, owner_user_id AS "ownerUserId", name, city, owner_name AS owner, status, pending_balance::float AS pending, available_balance::float AS available
       FROM shops WHERE owner_user_id = $1 LIMIT 1`,
      [user.id]
    );
    res.json({ user, shop: sRes.rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

app.post('/api/seller-applications', async (req, res) => {
  try {
    const { userId, fullName, phone, address, shopName, shopCity, cinNumber, cinFrontUrl, cinBackUrl, notes } = req.body;
    if (!userId || !fullName || !phone || !address || !shopName || !shopCity || !cinFrontUrl || !cinBackUrl) {
      return res.status(400).json({ error: 'Remplissez toutes les informations et les photos CIN recto et verso' });
    }

    const uRes = await pool.query('SELECT id FROM users WHERE id = $1', [Number(userId)]);
    if (!uRes.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const r = await pool.query(
      `INSERT INTO seller_applications (user_id, full_name, phone, address, shop_name, shop_city, cin_number, cin_front_url, cin_back_url, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'EN_ATTENTE')
       RETURNING id, user_id AS "userId", full_name AS "fullName", phone, address, shop_name AS "shopName", shop_city AS "shopCity", cin_number AS "cinNumber", cin_front_url AS "cinFrontUrl", cin_back_url AS "cinBackUrl", notes, status, created_at AS "createdAt"`,
      [Number(userId), fullName, phone, address, shopName, shopCity, cinNumber || '', cinFrontUrl, cinBackUrl, notes || '']
    );

    await pool.query(
      `UPDATE users SET full_name = $1, phone = $2, city_location = $3 WHERE id = $4`,
      [fullName, phone, `${shopCity}, Madagascar`, Number(userId)]
    );

    res.status(201).json({ application: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur envoi dossier vendeur' });
  }
});

app.post('/api/seller-applications/:id/review', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appId = Number(req.params.id);
    const { decision } = req.body; // 'APPROUVEE' ou 'REJETEE'
    if (!['APPROUVEE', 'REJETEE'].includes(decision)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Décision invalide' });
    }

    const aRes = await client.query('SELECT * FROM seller_applications WHERE id = $1', [appId]);
    if (!aRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Dossier introuvable' });
    }
    const appRow = aRes.rows[0];

    await client.query('UPDATE seller_applications SET status = $1 WHERE id = $2', [decision, appId]);

    if (decision === 'APPROUVEE') {
      await client.query(
        `UPDATE users SET role = CASE WHEN role = 'ADMINISTRATEUR' THEN 'ADMINISTRATEUR' ELSE 'VENDEUR' END WHERE id = $1`,
        [appRow.user_id]
      );
      await client.query(
        `INSERT INTO shops (owner_user_id, name, city, owner_name, status)
         VALUES ($1,$2,$3,$4,'APPROUVEE')
         ON CONFLICT (name) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id, city = EXCLUDED.city, owner_name = EXCLUDED.owner_name, status = 'APPROUVEE'`,
        [appRow.user_id, appRow.shop_name, appRow.shop_city, appRow.full_name]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur validation dossier' });
  } finally {
    client.release();
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const viewerId = req.query.viewerId ? Number(req.query.viewerId) : null;
    const uRes = await pool.query(
      `SELECT id, full_name AS "fullName", phone, email, role, bio, note_text AS "noteText", city_location AS "cityLocation", birthday, is_profile_locked AS "isProfileLocked", avatar_url AS "avatarUrl", cover_url AS "coverUrl"
       FROM users WHERE id = $1`,
      [userId]
    );
    if (!uRes.rows.length) return res.status(404).json({ error: 'Profil introuvable' });

    const [sRes, allPosts, storiesRes, folCountRes, isFolRes, myAppsRes] = await Promise.all([
      pool.query('SELECT id, owner_user_id AS "ownerUserId", name, city, owner_name AS owner, status FROM shops WHERE owner_user_id = $1', [userId]),
      fetchPosts(viewerId),
      pool.query('SELECT id, user_id AS "userId", photo_url AS "photoUrl", caption, created_at AS "createdAt" FROM stories WHERE user_id = $1 ORDER BY id DESC', [userId]),
      pool.query('SELECT COUNT(*)::int AS cnt FROM user_follows WHERE following_id = $1', [userId]),
      viewerId ? pool.query('SELECT 1 FROM user_follows WHERE follower_id = $1 AND following_id = $2', [viewerId, userId]) : Promise.resolve({ rows: [] }),
      pool.query('SELECT id, shop_name AS "shopName", shop_city AS "shopCity", status, created_at AS "createdAt" FROM seller_applications WHERE user_id = $1 ORDER BY id DESC', [userId])
    ]);

    const userPosts = allPosts.filter(p => p.userId === userId && !p.isAnonymous);
    res.json({
      profile: uRes.rows[0],
      shops: sRes.rows,
      posts: userPosts,
      stories: storiesRes.rows,
      applications: myAppsRes.rows,
      followersCount: folCountRes.rows[0]?.cnt || 0,
      isFollowing: isFolRes.rows.length > 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur chargement profil' });
  }
});

app.put('/api/users/:id/profile', async (req, res) => {
  try {
    const { fullName, phone, email, bio, noteText, cityLocation, birthday, isProfileLocked, avatarUrl, coverUrl } = req.body;
    const r = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           email = COALESCE($3, email),
           bio = COALESCE($4, bio),
           note_text = COALESCE($5, note_text),
           city_location = COALESCE($6, city_location),
           birthday = COALESCE($7, birthday),
           is_profile_locked = COALESCE($8, is_profile_locked),
           avatar_url = COALESCE($9, avatar_url),
           cover_url = COALESCE($10, cover_url)
       WHERE id = $11
       RETURNING id, full_name AS "fullName", phone, email, role, bio, note_text AS "noteText", city_location AS "cityLocation", birthday, is_profile_locked AS "isProfileLocked", avatar_url AS "avatarUrl", cover_url AS "coverUrl"`,
      [fullName, phone, email, bio, noteText, cityLocation, birthday, typeof isProfileLocked === 'boolean' ? isProfileLocked : null, avatarUrl, coverUrl, Number(req.params.id)]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ user: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur mise à jour profil' });
  }
});

app.post('/api/users/:id/follow', async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const followerId = Number(req.body.followerId);
    if (!followerId || followerId === targetId) return res.status(400).json({ error: 'Action invalide' });

    const exists = await pool.query('SELECT 1 FROM user_follows WHERE follower_id = $1 AND following_id = $2', [followerId, targetId]);
    if (exists.rows.length) {
      await pool.query('DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2', [followerId, targetId]);
    } else {
      await pool.query('INSERT INTO user_follows (follower_id, following_id) VALUES ($1,$2)', [followerId, targetId]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur abonnement' });
  }
});

app.post('/api/stories', async (req, res) => {
  try {
    const { userId, photoUrl, caption } = req.body;
    if (!userId || !photoUrl) return res.status(400).json({ error: 'Photo et connexion requises' });
    const r = await pool.query(
      'INSERT INTO stories (user_id, photo_url, caption) VALUES ($1,$2,$3) RETURNING id',
      [Number(userId), photoUrl, caption || '']
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur ajout story' });
  }
});

app.post('/api/posts', async (req, res) => {
  try {
    const { userId, caption, photoUrl, isAnonymous } = req.body;
    if (!userId) return res.status(400).json({ error: 'Connexion requise pour publier' });
    if (!caption && !photoUrl) return res.status(400).json({ error: 'Ajoutez une photo ou un texte' });

    const r = await pool.query(
      `INSERT INTO community_posts (user_id, caption, photo_url, is_anonymous)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [Number(userId), caption || '', photoUrl || '', Boolean(isAnonymous)]
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur publication' });
  }
});

app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.body.userId);
    if (!userId) return res.status(400).json({ error: 'Connexion requise' });

    const exists = await pool.query('SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
    if (exists.rows.length) {
      await pool.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
    } else {
      await pool.query('INSERT INTO post_likes (post_id, user_id) VALUES ($1,$2)', [postId, userId]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interaction J’aime' });
  }
});

app.post('/api/posts/:id/comments', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { userId, content } = req.body;
    if (!userId || !content) return res.status(400).json({ error: 'Connexion et commentaire requis' });

    await pool.query(
      'INSERT INTO post_comments (post_id, user_id, content) VALUES ($1,$2,$3)',
      [postId, Number(userId), content]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur commentaire' });
  }
});

app.post('/api/posts/:id/share', async (req, res) => {
  try {
    const sourceId = Number(req.params.id);
    const { userId, caption } = req.body;
    if (!userId) return res.status(400).json({ error: 'Connexion requise pour partager' });

    const origRes = await pool.query('SELECT id, shared_from_id FROM community_posts WHERE id = $1', [sourceId]);
    if (!origRes.rows.length) return res.status(404).json({ error: 'Publication introuvable' });
    const rootId = origRes.rows[0].shared_from_id || origRes.rows[0].id;

    await pool.query(
      'INSERT INTO community_posts (user_id, caption, photo_url, shared_from_id) VALUES ($1,$2,$3,$4)',
      [Number(userId), caption || '', '', rootId]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur partage' });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const userId = Number(req.query.userId);
    const withUserId = Number(req.query.withUserId);
    if (!userId || !withUserId) return res.status(400).json({ error: 'Paramètres requis' });

    await pool.query('UPDATE messages SET is_read = TRUE WHERE sender_id = $1 AND receiver_id = $2', [withUserId, userId]);

    const r = await pool.query(
      `SELECT id, sender_id AS "senderId", receiver_id AS "receiverId", content, image_url AS "imageUrl", is_read AS "isRead", created_at AS "createdAt"
       FROM messages
       WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
       ORDER BY id ASC`,
      [userId, withUserId]
    );
    res.json({ messages: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur chargement messages' });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { senderId, receiverId, content, imageUrl } = req.body;
    if (!senderId || !receiverId) return res.status(400).json({ error: 'Expéditeur et destinataire requis' });
    if (!content && !imageUrl) return res.status(400).json({ error: 'Message vide' });

    const r = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, content, image_url)
       VALUES ($1,$2,$3,$4)
       RETURNING id, sender_id AS "senderId", receiver_id AS "receiverId", content, image_url AS "imageUrl", is_read AS "isRead", created_at AS "createdAt"`,
      [Number(senderId), Number(receiverId), content || '', imageUrl || '']
    );
    res.status(201).json({ message: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur envoi message' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, category, price, promo, stock, city, shop, emoji } = req.body;
    const r = await pool.query(
      `INSERT INTO products (shop_name, name, category, city, price, promo_price, stock, rating, sales, icon_kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7,5.0,0,$8)
       RETURNING id, shop_name AS shop, name, category, city, price::float, promo_price::float AS promo, stock, rating::float, sales, icon_kind AS emoji`,
      [shop, name, category, city, Number(price), promo ? Number(promo) : null, Number(stock), emoji || 'box']
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur création produit' });
  }
});

app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { userId, customerName, customerPhone, city, deliveryType, address, payMethod, txRef, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Panier vide' });
    }

    const [sRes, rateRes, chRes] = await Promise.all([
      client.query('SELECT commission_rate FROM platform_settings WHERE id = 1'),
      client.query('SELECT fee FROM delivery_rates WHERE city = $1 AND delivery_type = $2', [city, deliveryType]),
      client.query('SELECT requires_proof FROM payment_channels WHERE code = $1', [payMethod])
    ]);

    const commRate = Number(sRes.rows[0]?.commission_rate ?? 5);
    const unitFee = Number(rateRes.rows[0]?.fee ?? 0);
    const requiresProof = Boolean(chRes.rows[0]?.requires_proof ?? true);

    const byShop = {};
    let subtotal = 0;
    for (const it of items) {
      const line = Number(it.price) * Number(it.qty);
      subtotal += line;
      byShop[it.shop] = (byShop[it.shop] || 0) + line;
      await client.query('UPDATE products SET stock = GREATEST(0, stock - $1), sales = sales + $1 WHERE id = $2', [Number(it.qty), it.id]);
    }

    const shopsCount = Object.keys(byShop).length;
    const deliveryFee = unitFee * shopsCount;
    const total = subtotal + deliveryFee;
    const orderNum = 'MM-' + Date.now().toString().slice(-6);
    const payStatus = requiresProof ? 'EN_VERIFICATION' : 'EN_ATTENTE';
    const orderStatus = requiresProof ? 'EN_ATTENTE_PAIEMENT' : 'COMMANDE_CONFIRMEE';

    const ordRes = await client.query(
      `INSERT INTO orders (order_num, user_id, customer_name, customer_phone, city, delivery_type, address, pay_method, subtotal, delivery_fee, total, pay_status, order_status, tx_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, order_num AS "orderNum", user_id AS "userId", customer_name AS customer, customer_phone AS phone, city, delivery_type AS "deliveryType", address, pay_method AS method, total::float, pay_status AS "payStatus", order_status AS "orderStatus", tx_ref AS "txRef"`,
      [orderNum, userId || null, customerName, customerPhone, city, deliveryType, address, payMethod, subtotal, deliveryFee, total, payStatus, orderStatus, txRef || '']
    );
    const order = ordRes.rows[0];

    let idx = 0;
    for (const shopName of Object.keys(byShop)) {
      idx += 1;
      const sSub = byShop[shopName];
      const comm = Math.round((sSub * commRate) / 100);
      const net = sSub - comm;
      await client.query(
        `INSERT INTO sub_orders (sub_num, order_id, shop_name, subtotal, commission_amount, net_amount, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [`${orderNum}-V${idx}`, order.id, shopName, sSub, comm, net, orderStatus]
      );
    }

    await client.query(
      `INSERT INTO payments (order_id, order_num, customer_name, method, amount, tx_ref, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [order.id, orderNum, order.customer, payMethod, total, txRef || '', payStatus]
    );

    await client.query('COMMIT');
    res.status(201).json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur création commande' });
  } finally {
    client.release();
  }
});

app.patch('/api/sub-orders/:id/status', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const subId = Number(req.params.id);
    const { status } = req.body;
    const curRes = await client.query('SELECT * FROM sub_orders WHERE id = $1', [subId]);
    if (!curRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sous-commande introuvable' });
    }
    const sub = curRes.rows[0];
    await client.query('UPDATE sub_orders SET status = $1 WHERE id = $2', [status, subId]);

    if (status === 'LIVREE' && sub.status !== 'LIVREE') {
      await client.query(
        `UPDATE shops
         SET pending_balance = GREATEST(0, pending_balance - $1),
             available_balance = available_balance + $1
         WHERE name = $2`,
        [Number(sub.net_amount), sub.shop_name]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur mise à jour sous-commande' });
  } finally {
    client.release();
  }
});

app.post('/api/shops/:id/withdraw', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const shopId = Number(req.params.id);
    const sRes = await client.query('SELECT available_balance FROM shops WHERE id = $1', [shopId]);
    const avail = Number(sRes.rows[0]?.available_balance || 0);
    if (avail <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Solde disponible insuffisant' });
    }
    await client.query('UPDATE shops SET available_balance = 0 WHERE id = $1', [shopId]);
    await client.query('INSERT INTO withdrawals (shop_id, amount, status) VALUES ($1,$2,$3)', [shopId, avail, 'DEMANDE']);
    await client.query('COMMIT');
    res.json({ amount: avail });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur retrait' });
  } finally {
    client.release();
  }
});

app.put('/api/settings/commission', async (req, res) => {
  try {
    const rate = Number(req.body.commissionRate);
    if (isNaN(rate) || rate < 0 || rate > 50) return res.status(400).json({ error: 'Taux invalide' });
    await pool.query('UPDATE platform_settings SET commission_rate = $1 WHERE id = 1', [rate]);
    res.json({ commissionRate: rate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur commission' });
  }
});

app.put('/api/delivery-rates', async (req, res) => {
  try {
    const { city, deliveryType, fee } = req.body;
    await pool.query(
      `INSERT INTO delivery_rates (city, delivery_type, fee)
       VALUES ($1,$2,$3)
       ON CONFLICT (city, delivery_type) DO UPDATE SET fee = EXCLUDED.fee`,
      [city, deliveryType, Number(fee)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur tarif livraison' });
  }
});

app.put('/api/payment-channels/:code', async (req, res) => {
  try {
    const { accountNumber, accountHolder } = req.body;
    await pool.query(
      'UPDATE payment_channels SET account_number = $1, account_holder = $2 WHERE code = $3',
      [accountNumber, accountHolder, req.params.code]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur numéro paiement' });
  }
});

app.patch('/api/shops/:id/status', async (req, res) => {
  try {
    await pool.query('UPDATE shops SET status = $1 WHERE id = $2', [req.body.status, Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur statut boutique' });
  }
});

app.post('/api/payments/:id/confirm', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const payId = Number(req.params.id);
    const pRes = await client.query('SELECT * FROM payments WHERE id = $1', [payId]);
    if (!pRes.rows.length || pRes.rows[0].status === 'CONFIRME') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Paiement invalide ou déjà confirmé' });
    }
    const p = pRes.rows[0];
    await client.query("UPDATE payments SET status = 'CONFIRME' WHERE id = $1", [payId]);
    await client.query("UPDATE orders SET pay_status = 'CONFIRME', order_status = 'COMMANDE_CONFIRMEE' WHERE id = $1", [p.order_id]);

    const subs = await client.query('SELECT * FROM sub_orders WHERE order_id = $1', [p.order_id]);
    for (const s of subs.rows) {
      await client.query("UPDATE sub_orders SET status = 'COMMANDE_CONFIRMEE' WHERE id = $1", [s.id]);
      await client.query('UPDATE shops SET pending_balance = pending_balance + $1 WHERE name = $2', [Number(s.net_amount), s.shop_name]);
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur confirmation paiement' });
  } finally {
    client.release();
  }
});

ensureAdminAccount().then(() => {
  app.listen(PORT, () => {
    console.log(`MadaMarket API PostgreSQL active sur http://localhost:${PORT}`);
  });
});
