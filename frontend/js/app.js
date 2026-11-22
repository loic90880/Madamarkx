const DEMO_PRODUCTS = [
    {
        id: 1,
        name: "Vanille Bourbon Noire de Sambava (250g)",
        price: 65000,
        promo_price: 55000,
        category: "Produits Locaux & Artisanat",
        city: "Antsiranana",
        shop: "Comptoir du Nord",
        rating: 4.9,
        in_stock: true,
        is_promo: true,
        sales: 140,
        emoji: "🌿"
    },
    {
        id: 2,
        name: "Smartphone Android 128Go Double SIM",
        price: 890000,
        promo_price: null,
        category: "Téléphones & Tablettes",
        city: "Antananarivo",
        shop: "Tana Tech Store",
        rating: 4.6,
        in_stock: true,
        is_promo: false,
        sales: 95,
        emoji: "📱"
    },
    {
        id: 3,
        name: "Panier Tressé en Raphia Artisanal",
        price: 38000,
        promo_price: 29000,
        category: "Produits Locaux & Artisanat",
        city: "Mahajanga",
        shop: "Arts de Boeny",
        rating: 4.8,
        in_stock: true,
        is_promo: true,
        sales: 210,
        emoji: "🧺"
    },
    {
        id: 4,
        name: "Ordinateur Portable 15.6\" i5 / 8Go / 512Go SSD",
        price: 2450000,
        promo_price: 2250000,
        category: "Informatique & Électronique",
        city: "Toamasina",
        shop: "Océan Informatique",
        rating: 4.7,
        in_stock: true,
        is_promo: true,
        sales: 42,
        emoji: "💻"
    },
    {
        id: 5,
        name: "Miel d'Eucalyptus Naturel (1kg)",
        price: 32000,
        promo_price: null,
        category: "Alimentation & Épicerie",
        city: "Antsirabe",
        shop: "Rucher des Hautes Terres",
        rating: 4.5,
        in_stock: true,
        is_promo: false,
        sales: 175,
        emoji: "🍯"
    },
    {
        id: 6,
        name: "Ensemble Mode Coton & Wax",
        price: 75000,
        promo_price: null,
        category: "Mode & Vêtements",
        city: "Fianarantsoa",
        shop: "Style Betsileo",
        rating: 4.2,
        in_stock: false,
        is_promo: false,
        sales: 60,
        emoji: "👗"
    }
];

function formatAr(amount) {
    return new Intl.NumberFormat('fr-MG').format(amount) + ' Ar';
}

function getCart() {
    return JSON.parse(localStorage.getItem('mm_cart') || '[]');
}

function saveCart(cart) {
    localStorage.setItem('mm_cart', JSON.stringify(cart));
    updateCartBadge();
}

function updateCartBadge() {
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    const totalQty = getCart().reduce((sum, item) => sum + item.qty, 0);
    badge.textContent = totalQty;
}

function addToCart(productId) {
    const prod = DEMO_PRODUCTS.find(p => p.id === productId);
    if (!prod) return;
    const cart = getCart();
    const existing = cart.find(i => i.id === productId);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({
            id: prod.id,
            name: prod.name,
            price: prod.promo_price || prod.price,
            shop: prod.shop,
            city: prod.city,
            qty: 1
        });
    }
    saveCart(cart);
    alert(`"${prod.name}" ajouté au panier !`);
}

function selectCategoryPill(catName, el) {
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    if (el) el.classList.add('active');
    const select = document.getElementById('filterCat');
    if (select) select.value = catName;
    renderProducts();
}

function renderProducts() {
    const container = document.getElementById('productsGrid');
    if (!container) return;

    const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const cat = document.getElementById('filterCat')?.value || '';
    const city = document.getElementById('filterCity')?.value || '';
    const minP = parseFloat(document.getElementById('minPrice')?.value) || 0;
    const maxP = parseFloat(document.getElementById('maxPrice')?.value) || Infinity;
    const rating = parseFloat(document.getElementById('filterRating')?.value) || 0;
    const onlyStock = document.getElementById('onlyStock')?.checked || false;
    const onlyPromo = document.getElementById('onlyPromo')?.checked || false;
    const sortBy = document.getElementById('sortSelect')?.value || 'popular';

    let list = DEMO_PRODUCTS.filter(p => {
        const effectivePrice = p.promo_price || p.price;
        if (q && !p.name.toLowerCase().includes(q) && !p.shop.toLowerCase().includes(q)) return false;
        if (cat && p.category !== cat) return false;
        if (city && p.city !== city) return false;
        if (effectivePrice < minP || effectivePrice > maxP) return false;
        if (p.rating < rating) return false;
        if (onlyStock && !p.in_stock) return false;
        if (onlyPromo && !p.is_promo) return false;
        return true;
    });

    if (sortBy === 'price_asc') {
        list.sort((a, b) => (a.promo_price || a.price) - (b.promo_price || b.price));
    } else if (sortBy === 'price_desc') {
        list.sort((a, b) => (b.promo_price || b.price) - (a.promo_price || a.price));
    } else if (sortBy === 'best_sales') {
        list.sort((a, b) => b.sales - a.sales);
    } else {
        list.sort((a, b) => b.rating - a.rating);
    }

    if (list.length === 0) {
        container.innerHTML = '<p>Aucun produit trouvé avec ces filtres.</p>';
        return;
    }

    container.innerHTML = list.map(p => {
        const priceHtml = p.promo_price
            ? `<span class="card-price">${formatAr(p.promo_price)}</span><span class="card-old">${formatAr(p.price)}</span>`
            : `<span class="card-price">${formatAr(p.price)}</span>`;
        const stockLabel = p.in_stock ? 'En stock' : 'Rupture';

        return `
            <div class="card">
                <div class="card-img">${p.emoji}</div>
                <div class="card-body">
                    <div>
                        <div class="card-meta">📍 ${p.city} • ★ ${p.rating} • ${stockLabel}</div>
                        <div class="card-title">${p.name}</div>
                        <div>${priceHtml}</div>
                        <div class="card-shop">Boutique : <strong>${p.shop}</strong></div>
                    </div>
                    <button class="btn-orange" style="margin-top:10px;width:100%;" onclick="addToCart(${p.id})">
                        Ajouter au panier
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    updateCartBadge();
    renderProducts();
});
