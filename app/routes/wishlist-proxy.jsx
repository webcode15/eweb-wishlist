import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function moneyToCents(amount) {
  if (amount === null || amount === undefined) return null;
  if (typeof amount === "object" && amount !== null && "amount" in amount) {
    return moneyToCents(amount.amount);
  }
  if (typeof amount === "number" && Number.isFinite(amount)) {
    return Math.round(amount * 100);
  }
  let s = String(amount).trim();
  if (!s) return null;
  const numMatch = s.match(/-?[\d][\d.,]*/);
  if (!numMatch) return null;
  s = numMatch[0];
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const raw = Number(s);
  if (!Number.isFinite(raw)) return null;
  return Math.round(raw * 100);
}

/** Shopify shop billing country for contextual variant prices (markets). Cached per shop domain. */
const billingCountryCache = new Map();

async function getBillingCountryForShop(admin, shopDomain) {
  const key = shopDomain || "_";
  if (billingCountryCache.has(key)) {
    return billingCountryCache.get(key);
  }
  const res = await admin.graphql(
    `#graphql
      query EwwShopBillingCountry {
        shop {
          billingAddress {
            countryCodeV2
          }
        }
      }
    `,
  );
  const body = await res.json();
  if (body?.errors?.length) {
    return "US";
  }
  const code =
    body?.data?.shop?.billingAddress?.countryCodeV2 || "US";
  billingCountryCache.set(key, code);
  return code;
}

function variantSellingCents(v) {
  const direct = moneyToCents(v?.price);
  if (direct != null) return direct;
  return moneyToCents(v?.contextualPricing?.price);
}

function variantCompareAtCents(v) {
  const direct = moneyToCents(v?.compareAtPrice);
  if (direct != null) return direct;
  return moneyToCents(v?.contextualPricing?.compareAtPrice);
}

/**
 * Fix rare Admin API cases where current price is scaled ~×100 vs compare-at (e.g. 199900 vs 2499 for $19.99 / $24.99).
 */
function normalizeSalePriceCents(priceCents, compareRaw) {
  let p = priceCents;
  if (
    p != null &&
    compareRaw != null &&
    p > compareRaw &&
    compareRaw >= 50 &&
    compareRaw <= 500_000 &&
    p >= 10_000 &&
    p % 100 === 0
  ) {
    const scaled = Math.round(p / 100);
    if (scaled < compareRaw) {
      p = scaled;
    }
  }
  return p;
}

/** Same variant for selling + compare-at: cheapest variant by current price (handles multi-variant products). */
function pickCheapestVariantSnapshot(variantNodes) {
  const list = Array.isArray(variantNodes) ? variantNodes : [];
  let bestVariant = null;
  let bestPriceCents = Infinity;
  for (const v of list) {
    const cents = variantSellingCents(v);
    if (cents === null || cents === undefined) continue;
    if (cents < bestPriceCents) {
      bestPriceCents = cents;
      bestVariant = v;
    }
  }
  if (!bestVariant) return null;
  let priceCents = variantSellingCents(bestVariant);
  const compareRaw = variantCompareAtCents(bestVariant);
  priceCents = normalizeSalePriceCents(priceCents, compareRaw);
  const compareAtPriceCents =
    compareRaw != null &&
    priceCents != null &&
    compareRaw > priceCents
      ? compareRaw
      : null;
  return {
    variantId: bestVariant.id ?? null,
    priceCents,
    compareAtPriceCents,
  };
}

function gidToNumericId(gid) {
  if (!gid) return null;
  const parts = String(gid).split("/");
  const last = parts[parts.length - 1];
  return last && /^[0-9]+$/.test(last) ? last : null;
}

/** Use in queries that declare `$country: CountryCode!`. */
const GQL_VARIANT_PRICE_FIELDS = `
            id
            price
            compareAtPrice
            contextualPricing(context: { country: $country }) {
              price {
                amount
              }
              compareAtPrice {
                amount
              }
            }`;

/**
 * Scalar `price` / `compareAtPrice` + `contextualPricing` (markets).
 * @see https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductVariant
 */
const PRODUCT_PRICE_QUERY = `#graphql
  query ProductPriceByHandle($query: String!, $country: CountryCode!) {
    shop {
      currencyCode
    }
    products(first: 1, query: $query) {
      nodes {
        id
        handle
        variants(first: 100) {
          nodes {
${GQL_VARIANT_PRICE_FIELDS}
          }
        }
      }
    }
  }
`;

async function getProductPriceByHandle(admin, productHandle, shopDomain) {
  const country = await getBillingCountryForShop(admin, shopDomain);
  const response = await admin.graphql(PRODUCT_PRICE_QUERY, {
    variables: {
      query: `handle:${productHandle}`,
      country,
    },
  });
  const body = await response.json();
  const node = body?.data?.products?.nodes?.[0];
  if (!node) return null;

  const snap = pickCheapestVariantSnapshot(node.variants?.nodes);
  if (!snap) return null;

  return {
    productGid: node.id,
    productNumericId: gidToNumericId(node.id),
    handle: node.handle,
    priceCents: snap.priceCents,
    compareAtPriceCents: snap.compareAtPriceCents,
    currencyCode: body?.data?.shop?.currencyCode ?? null,
  };
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // Validates the request is coming through Shopify's App Proxy.
  const { admin } = await authenticate.public.appProxy(request);
  const shop = url.searchParams.get("shop") || "";
  const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");

  if (action === "state") {
    const visitorId = url.searchParams.get("visitorId") || "";
    if (!visitorId) return Response.json({ activeProductHandles: [] });

    const items = await prisma.wishlistItem.findMany({
      where: { shopDomain: shop, visitorId, isActive: true },
      select: { productHandle: true },
    });

    return Response.json({
      activeProductHandles: items.map((i) => i.productHandle),
    });
  }

  if (action === "list") {
    const visitorId = url.searchParams.get("visitorId") || "";
    if (!shop || !visitorId) return Response.json({ items: [] });

    const items = await prisma.wishlistItem.findMany({
      where: { shopDomain: shop, visitorId, isActive: true },
      select: { productHandle: true, priceCents: true, compareAtPriceCents: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    const handles = items.map((i) => i.productHandle).filter(Boolean);
    if (!handles.length) return Response.json({ items: [] });

    const country = await getBillingCountryForShop(admin, shop);
    const response = await admin.graphql(
      `#graphql
        query WishlistProductsByHandles($query: String!, $first: Int!, $country: CountryCode!) {
          shop {
            currencyCode
          }
          products(first: $first, query: $query) {
            nodes {
              id
              handle
              title
              featuredImage {
                url
                altText
              }
              variants(first: 100) {
                nodes {
${GQL_VARIANT_PRICE_FIELDS}
                }
              }
            }
          }
        }`,
      {
        variables: {
          first: Math.min(handles.length, 100),
          query: handles.map((h) => `handle:${h}`).join(" OR "),
          country,
        },
      },
    );
    const body = await response.json();
    const nodes = body?.data?.products?.nodes ?? [];
    const currencyCode = body?.data?.shop?.currencyCode ?? "INR";

    const itemByHandle = new Map(items.map((i) => [i.productHandle, i]));
    const payload = nodes.map((p) => {
      const row = itemByHandle.get(p.handle);
      const live = pickCheapestVariantSnapshot(p.variants?.nodes);
      return {
        id: p.id,
        handle: p.handle,
        title: p.title,
        image: p.featuredImage?.url || null,
        imageAlt: p.featuredImage?.altText || p.title,
        productUrl: `/products/${p.handle}`,
        variantId: live?.variantId ?? null,
        currencyCode,
        priceCents: row?.priceCents ?? live?.priceCents ?? 0,
        compareAtPriceCents:
          row?.compareAtPriceCents ?? live?.compareAtPriceCents ?? null,
      };
    });

    return Response.json({ items: payload });
  }

  if (action === "page" || !action) {
    const visitorFromCustomer = loggedInCustomerId
      ? `c:${loggedInCustomerId}`
      : "";
    const escapeHtml = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
    const pathPrefix = url.searchParams.get("path_prefix") || "";

    // Returning application/liquid lets Shopify render this through the store's
    // active theme, giving us the real header, footer, and CSS automatically.
    const liquid = `{% layout 'theme' %}
<meta name="eww-proxy-shop" content="${shop ? escapeHtml(shop) : ""}" />
<meta name="eww-path-prefix" content="${pathPrefix ? escapeHtml(pathPrefix) : ""}" />
<style>
  .eww-wrap{max-width:1200px;margin:32px auto;padding:0 16px}
  .eww-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
  .eww-title{font-size:28px;font-weight:700;margin:0}
  .eww-muted{color:#6d7175;font-size:14px}
  .eww-toolbar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
  .eww-input,.eww-select{border:1px solid #c9cccf;border-radius:8px;padding:8px 10px;font-size:14px;background:#fff;color:#202223}
  .eww-input{min-width:220px}
  .eww-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
  .eww-card{background:#fff;border:1px solid #e1e3e5;border-radius:12px;overflow:hidden}
  .eww-card img{width:100%;aspect-ratio:1/1;object-fit:cover;background:#f1f2f3;display:block}
  .eww-card-body{padding:12px}
  .eww-card-name{font-weight:600;margin:0 0 8px}
  .eww-card-price{font-size:14px}
  .eww-card-compare{color:#8c9196;text-decoration:line-through;margin-left:6px}
  .eww-card-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .eww-btn{border:1px solid #d2d5d8;border-radius:8px;background:#fff;padding:8px 12px;font-size:13px;cursor:pointer;text-decoration:none;display:inline-block}
  .eww-btn:hover{background:#f6f6f7}
  .eww-btn-primary{background:#111;color:#fff;border-color:#111}
  .eww-btn-primary:hover{background:#333}
  .eww-btn-danger{border-color:#d82c0d;color:#d82c0d}
  .eww-btn-danger:hover{background:#fff4f2}
  .eww-empty{margin-top:28px;padding:24px;background:#fff;border:1px dashed #c9cccf;border-radius:10px;text-align:center}
  .eww-pagination{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:16px}
  .eww-page-text{font-size:13px;color:#6d7175}
</style>

<div class="eww-wrap">
  <div class="eww-head">
    <h1 class="eww-title">My Wishlist</h1>
    <div class="eww-muted" id="eww-count">Loading...</div>
  </div>
  <div class="eww-toolbar">
    <input id="eww-search" class="eww-input" placeholder="Search wishlist products" />
    <select id="eww-sort" class="eww-select">
      <option value="latest">Latest added</option>
      <option value="price_desc">Price high to low</option>
      <option value="price_asc">Price low to high</option>
      <option value="title_asc">Title A-Z</option>
    </select>
    <button id="eww-remove-all" class="eww-btn eww-btn-danger">Remove all</button>
  </div>
  <div id="eww-content"></div>
  <div class="eww-pagination" id="eww-pagination" style="display:none;">
    <button class="eww-btn" id="eww-prev">Prev</button>
    <span class="eww-page-text" id="eww-page-text"></span>
    <button class="eww-btn" id="eww-next">Next</button>
  </div>
</div>

<script>
  (function(){
    var base = window.location.pathname;
    function getProxyShop(){
      var q=new URLSearchParams(window.location.search).get('shop');
      if(q) return q;
      var m=document.querySelector('meta[name="eww-proxy-shop"]');
      return (m&&m.getAttribute('content'))||'';
    }
    function getPathPrefix(){
      var q=new URLSearchParams(window.location.search).get('path_prefix');
      if(q) return q;
      var m=document.querySelector('meta[name="eww-path-prefix"]');
      return (m&&m.getAttribute('content'))||'';
    }
    function proxyUrl(extra){
      var p=new URLSearchParams();
      var sh=getProxyShop(); if(sh) p.set('shop',sh);
      var pp=getPathPrefix(); if(pp) p.set('path_prefix',pp);
      Object.keys(extra).forEach(function(k){ if(extra[k]!=null) p.set(k,String(extra[k])); });
      var qs=p.toString(); return qs?base+'?'+qs:base;
    }
    var customerVisitor=${JSON.stringify(visitorFromCustomer)};
    function getGuestId(){
      var k='eww_guest_id',id=localStorage.getItem(k);
      if(!id){id='g_'+Math.random().toString(16).slice(2)+Date.now();localStorage.setItem(k,id);}
      return id;
    }
    var visitorId=customerVisitor||('v:'+getGuestId());
    var fmt=function(cents,cur){return new Intl.NumberFormat('en',{style:'currency',currency:cur||'INR',maximumFractionDigits:2}).format((cents||0)/100);};
    var allItems=[],pageSize=12,currentPage=1;

    function sortItems(items,mode){
      var list=[].concat(items);
      if(mode==='price_desc') return list.sort(function(a,b){return(b.priceCents||0)-(a.priceCents||0);});
      if(mode==='price_asc') return list.sort(function(a,b){return(a.priceCents||0)-(b.priceCents||0);});
      if(mode==='title_asc') return list.sort(function(a,b){return(a.title||'').localeCompare(b.title||'');});
      return list;
    }

    function render(){
      var root=document.getElementById('eww-content');
      var q=(document.getElementById('eww-search').value||'').toLowerCase().trim();
      var sort=document.getElementById('eww-sort').value;
      var items=allItems.filter(function(i){return !q||(i.title||'').toLowerCase().includes(q);});
      items=sortItems(items,sort);
      var total=items.length,totalPages=Math.max(1,Math.ceil(total/pageSize));
      if(currentPage>totalPages) currentPage=totalPages;
      var start=(currentPage-1)*pageSize,pageItems=items.slice(start,start+pageSize);
      document.getElementById('eww-count').textContent=total+' item'+(total===1?'':'s');
      if(!items.length){
        root.innerHTML='<div class="eww-empty">No products in your wishlist.</div>';
        document.getElementById('eww-pagination').style.display='none';
        return;
      }
      var cards=pageItems.map(function(item){
        var price=fmt(item.priceCents,item.currencyCode);
        var old=item.compareAtPriceCents&&item.compareAtPriceCents>item.priceCents
          ?'<span class="eww-card-compare">'+fmt(item.compareAtPriceCents,item.currencyCode)+'</span>':'';
        return '<article class="eww-card" data-handle="'+item.handle+'">'+
          '<img src="'+(item.image||'')+'" alt="'+(item.imageAlt||item.title||'Product')+'" />'+
          '<div class="eww-card-body">'+
            '<p class="eww-card-name">'+(item.title||item.handle)+'</p>'+
            '<div class="eww-card-price">'+price+old+'</div>'+
            '<div class="eww-card-actions">'+
              '<a class="eww-btn" href="'+item.productUrl+'">View</a>'+
              '<button class="eww-btn eww-btn-danger" data-remove="'+item.handle+'">Remove</button>'+
              '<button class="eww-btn eww-btn-primary" data-cart="'+(item.variantId||'')+'" data-handle="'+item.handle+'">Add to cart</button>'+
            '</div>'+
          '</div>'+
        '</article>';
      }).join('');
      root.innerHTML='<div class="eww-grid">'+cards+'</div>';
      var pag=document.getElementById('eww-pagination');
      pag.style.display=totalPages>1?'flex':'none';
      document.getElementById('eww-page-text').textContent='Page '+currentPage+' of '+totalPages;
      document.getElementById('eww-prev').disabled=currentPage<=1;
      document.getElementById('eww-next').disabled=currentPage>=totalPages;

      root.querySelectorAll('[data-remove]').forEach(function(btn){
        btn.addEventListener('click',function(){
          var handle=btn.getAttribute('data-remove');
          fetch(proxyUrl({action:'toggle'}),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitorId:visitorId,productHandle:handle})}).catch(function(){});
          allItems=allItems.filter(function(i){return i.handle!==handle;});
          render();
        });
      });

      root.querySelectorAll('[data-cart]').forEach(function(btn){
        btn.addEventListener('click',function(){
          var variantId=btn.getAttribute('data-cart');
          var handle=btn.getAttribute('data-handle');
          if(!variantId){window.location.href='/cart';return;}
          fetch('/cart/add.js',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(variantId.split('/').pop()),quantity:1})})
            .then(function(){
              if(handle){
                fetch(proxyUrl({action:'toggle'}),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitorId:visitorId,productHandle:handle})}).catch(function(){});
                allItems=allItems.filter(function(i){return i.handle!==handle;});
              }
              window.location.href='/cart';
            }).catch(function(){window.location.href='/cart';});
        });
      });
    }

    document.getElementById('eww-search').addEventListener('input',function(){currentPage=1;render();});
    document.getElementById('eww-sort').addEventListener('change',function(){currentPage=1;render();});
    document.getElementById('eww-prev').addEventListener('click',function(){currentPage=Math.max(1,currentPage-1);render();});
    document.getElementById('eww-next').addEventListener('click',function(){currentPage+=1;render();});
    document.getElementById('eww-remove-all').addEventListener('click',function(){
      if(!allItems.length) return;
      var copy=[].concat(allItems);
      var chain=Promise.resolve();
      copy.forEach(function(item){
        chain=chain.then(function(){
          return fetch(proxyUrl({action:'toggle'}),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitorId:visitorId,productHandle:item.handle})}).catch(function(){});
        });
      });
      allItems=[];currentPage=1;render();
    });

    var hasShop=!!getProxyShop();
    fetch(proxyUrl({action:'list',visitorId:visitorId}),{credentials:'same-origin'})
      .then(function(r){if(!r.ok) throw new Error('HTTP '+r.status);return r.json();})
      .then(function(data){allItems=data.items||[];render();})
      .catch(function(){
        var msg=hasShop?'Unable to load wishlist. Please refresh.':'Missing shop context. Open this page from your store.';
        document.getElementById('eww-content').innerHTML='<div class="eww-empty">'+msg+'</div>';
        document.getElementById('eww-count').textContent='0 items';
      });
  })();
</script>`;

    return new Response(liquid, {
      headers: { "Content-Type": "application/liquid" },
    });
  }

  return Response.json({ ok: true });
};

export const action = async ({ request }) => {
  const url = new URL(request.url);
  const actionType = url.searchParams.get("action");

  const { admin } = await authenticate.public.appProxy(request);
  const shop = url.searchParams.get("shop") || "";

  const body = await request.json().catch(() => ({}));

  if (actionType === "toggle") {
    const visitorId = body.visitorId || "";
    const productHandle = body.productHandle || "";
    const currencyCode = body.currencyCode || null;
    const productNumericId = body.productNumericId || null;

    if (!shop || !visitorId || !productHandle) {
      return Response.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    const existing = await prisma.wishlistItem.findUnique({
      where: { shopVisitorProduct: { shopDomain: shop, visitorId, productHandle } },
    });

    if (existing?.isActive) {
      await prisma.wishlistItem.update({
        where: { shopVisitorProduct: { shopDomain: shop, visitorId, productHandle } },
        data: {
          isActive: false,
          removedAt: new Date(),
        },
      });

      return Response.json({ ok: true, active: false });
    }

    // On "add", snapshot price (so admin analytics doesn't need storefront parsing).
    let priceCents = body.priceCents ?? null;
    let compareAtPriceCents = body.compareAtPriceCents ?? null;
    let derivedCurrencyCode = currencyCode ?? null;
    let derivedProductNumericId = productNumericId ?? null;

    const product = await getProductPriceByHandle(
      admin,
      productHandle,
      shop,
    ).catch(() => null);
    if (product) {
      priceCents = priceCents ?? product.priceCents ?? null;
      compareAtPriceCents = compareAtPriceCents ?? product.compareAtPriceCents ?? null;
      derivedCurrencyCode = derivedCurrencyCode ?? product.currencyCode ?? null;
      derivedProductNumericId = derivedProductNumericId ?? product.productNumericId ?? null;
    }

    const upserted = await prisma.wishlistItem.upsert({
      where: { shopVisitorProduct: { shopDomain: shop, visitorId, productHandle } },
      create: {
        shopDomain: shop,
        visitorId,
        productHandle,
        productNumericId: derivedProductNumericId,
        priceCents: priceCents,
        compareAtPriceCents: compareAtPriceCents,
        currencyCode: derivedCurrencyCode,
        isActive: true,
        addedAt: new Date(),
        removedAt: null,
        customerId: body.customerId || null,
        customerEmail: body.customerEmail || null,
      },
      update: {
        isActive: true,
        addedAt: new Date(),
        removedAt: null,
        productNumericId: derivedProductNumericId ?? undefined,
        priceCents: priceCents ?? undefined,
        compareAtPriceCents: compareAtPriceCents ?? undefined,
        currencyCode: derivedCurrencyCode ?? undefined,
        customerId: body.customerId || existing?.customerId || undefined,
        customerEmail: body.customerEmail || existing?.customerEmail || undefined,
      },
    });

    return Response.json({ ok: true, active: upserted.isActive });
  }

  return Response.json({ ok: false, error: "Unsupported action" }, { status: 400 });
};

