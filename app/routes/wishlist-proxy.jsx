import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function moneyToCents(amount) {
  if (amount === null || amount === undefined) return null;
  const asNum = typeof amount === "number" ? amount : Number(String(amount));
  if (!Number.isFinite(asNum)) return null;
  return Math.round(asNum * 100);
}

function gidToNumericId(gid) {
  if (!gid) return null;
  const parts = String(gid).split("/");
  const last = parts[parts.length - 1];
  return last && /^[0-9]+$/.test(last) ? last : null;
}

async function getProductPriceByHandle(admin, productHandle) {
  const response = await admin.graphql(
    `#graphql
      query ProductPriceByHandle($query: String!) {
        shop {
          currencyCode
        }
        products(first: 1, query: $query) {
          nodes {
            id
            handle
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            variants(first: 1) {
              nodes {
                compareAtPrice
              }
            }
          }
        }
      }`,
    {
      variables: {
        query: `handle:${productHandle}`,
      },
    },
  );

  const body = await response.json();
  const node = body?.data?.products?.nodes?.[0];
  if (!node) return null;

  return {
    productGid: node.id,
    productNumericId: gidToNumericId(node.id),
    handle: node.handle,
    priceCents: moneyToCents(node.priceRange?.minVariantPrice?.amount),
    compareAtPriceCents: moneyToCents(node.variants?.nodes?.[0]?.compareAtPrice),
    currencyCode:
      body?.data?.shop?.currencyCode ??
      node.priceRange?.minVariantPrice?.currencyCode ??
      null,
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

    const response = await admin.graphql(
      `#graphql
        query WishlistProductsByHandles($query: String!, $first: Int!) {
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
              variants(first: 1) {
                nodes {
                  id
                  compareAtPrice
                  price
                }
              }
            }
          }
        }`,
      {
        variables: {
          first: Math.min(handles.length, 100),
          query: handles.map((h) => `handle:${h}`).join(" OR "),
        },
      },
    );
    const body = await response.json();
    const nodes = body?.data?.products?.nodes ?? [];
    const currencyCode = body?.data?.shop?.currencyCode ?? "INR";

    const itemByHandle = new Map(items.map((i) => [i.productHandle, i]));
    const payload = nodes.map((p) => {
      const snap = itemByHandle.get(p.handle);
      const variant = p.variants?.nodes?.[0];
      return {
        id: p.id,
        handle: p.handle,
        title: p.title,
        image: p.featuredImage?.url || null,
        imageAlt: p.featuredImage?.altText || p.title,
        productUrl: `/products/${p.handle}`,
        variantId: p.variants?.nodes?.[0]?.id || null,
        currencyCode,
        priceCents:
          snap?.priceCents ??
          moneyToCents(variant?.price) ??
          0,
        compareAtPriceCents:
          snap?.compareAtPriceCents ??
          moneyToCents(variant?.compareAtPrice) ??
          null,
      };
    });

    return Response.json({ items: payload });
  }

  if (action === "page" || !action) {
    const visitorFromCustomer = loggedInCustomerId
      ? `c:${loggedInCustomerId}`
      : "";
    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My Wishlist</title>
    <style>
      body{font-family:Inter,Arial,sans-serif;margin:0;background:#f6f6f7;color:#202223}
      .wrap{max-width:1100px;margin:24px auto;padding:0 16px}
      .head{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .title{font-size:28px;font-weight:700;margin:0}
      .muted{color:#6d7175;font-size:14px}
      .toolbar{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
      .input,.select{border:1px solid #c9cccf;border-radius:8px;padding:8px 10px;font-size:14px;background:#fff}
      .input{min-width:220px}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:18px}
      .card{background:#fff;border:1px solid #e1e3e5;border-radius:12px;overflow:hidden}
      .img{width:100%;aspect-ratio:1/1;object-fit:cover;background:#f1f2f3}
      .body{padding:12px}
      .name{font-weight:600;margin:0 0 8px 0}
      .price{font-size:14px}
      .old{color:#8c9196;text-decoration:line-through;margin-left:8px}
      .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .btn{border:1px solid #d2d5d8;border-radius:8px;background:#fff;padding:8px 10px;font-size:13px;cursor:pointer}
      .btn.primary{background:#111;color:#fff;border-color:#111}
      .btn.danger{border-color:#d82c0d;color:#d82c0d}
      .link{display:inline-block;text-decoration:none;color:#005bd3;font-weight:600;padding:8px 0}
      .empty{margin-top:28px;padding:20px;background:#fff;border:1px dashed #c9cccf;border-radius:10px}
      .pagination{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px}
      .page-text{font-size:13px;color:#6d7175}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="head">
        <h1 class="title">My Wishlist</h1>
        <div class="muted" id="count">Loading...</div>
      </div>
      <div class="toolbar">
        <input id="search" class="input" placeholder="Search wishlist products" />
        <select id="sort" class="select">
          <option value="latest">Latest added</option>
          <option value="price_desc">Price high to low</option>
          <option value="price_asc">Price low to high</option>
          <option value="title_asc">Title A-Z</option>
        </select>
        <button id="remove-all" class="btn danger">Remove all</button>
      </div>
      <div id="content"></div>
      <div class="pagination" id="pagination" style="display:none;">
        <button class="btn" id="prev-page">Prev</button>
        <span class="page-text" id="page-text"></span>
        <button class="btn" id="next-page">Next</button>
      </div>
    </div>
    <script>
      const base = window.location.pathname;
      const customerVisitor = ${JSON.stringify(visitorFromCustomer)};
      function getGuestId(){
        const k='eww_guest_id';
        let id=localStorage.getItem(k);
        if(!id){ id='g_'+Math.random().toString(16).slice(2)+Date.now(); localStorage.setItem(k,id);}
        return id;
      }
      const visitorId = customerVisitor || ('v:'+getGuestId());
      const money = (cents, currency) => new Intl.NumberFormat('en',{style:'currency',currency:currency||'INR',maximumFractionDigits:2}).format((cents||0)/100);
      let allItems = [];
      const pageSize = 12;
      let currentPage = 1;

      function sortItems(items, mode){
        const list = [...items];
        if(mode === 'price_desc') return list.sort((a,b)=>(b.priceCents||0)-(a.priceCents||0));
        if(mode === 'price_asc') return list.sort((a,b)=>(a.priceCents||0)-(b.priceCents||0));
        if(mode === 'title_asc') return list.sort((a,b)=>(a.title||'').localeCompare(b.title||''));
        return list;
      }

      function render(){
        const root = document.getElementById('content');
        const q = (document.getElementById('search').value || '').toLowerCase().trim();
        const sort = document.getElementById('sort').value;
        let items = allItems.filter((i)=> !q || (i.title||'').toLowerCase().includes(q));
        items = sortItems(items, sort);
        const total = items.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (currentPage > totalPages) currentPage = totalPages;
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageItems = items.slice(start, end);

        document.getElementById('count').textContent = total + ' item' + (total===1?'':'s');
        if(!items.length){
          root.innerHTML = '<div class="empty">No products in wishlist for this filter.</div>';
          document.getElementById('pagination').style.display = 'none';
          return;
        }
        const cards = pageItems.map((item)=>{
          const price = money(item.priceCents, item.currencyCode);
          const old = item.compareAtPriceCents && item.compareAtPriceCents > item.priceCents
            ? '<span class="old">'+money(item.compareAtPriceCents, item.currencyCode)+'</span>' : '';
          const variantId = item.variantId || '';
          return '<article class="card" data-handle="'+item.handle+'">' +
            '<img class="img" src="'+(item.image||'')+'" alt="'+(item.imageAlt||item.title||'Product')+'" />' +
            '<div class="body">' +
              '<p class="name">'+(item.title||item.handle)+'</p>' +
              '<div class="price">'+price+old+'</div>' +
              '<div class="actions">' +
                '<a class="link" href="'+item.productUrl+'">View product</a>' +
                '<button class="btn" data-remove="'+item.handle+'">Remove</button>' +
                '<button class="btn primary" data-cart="'+variantId+'">Add to cart</button>' +
              '</div>' +
            '</div>' +
          '</article>';
        }).join('');
        root.innerHTML = '<section class="grid">'+cards+'</section>';
        const pagination = document.getElementById('pagination');
        pagination.style.display = totalPages > 1 ? 'flex' : 'none';
        document.getElementById('page-text').textContent = 'Page ' + currentPage + ' of ' + totalPages;
        document.getElementById('prev-page').disabled = currentPage <= 1;
        document.getElementById('next-page').disabled = currentPage >= totalPages;

        root.querySelectorAll('[data-remove]').forEach((btn)=>{
          btn.addEventListener('click', async ()=>{
            const handle = btn.getAttribute('data-remove');
            await fetch(base + '?action=toggle', {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ visitorId, productHandle: handle })
            }).catch(()=>null);
            allItems = allItems.filter((i)=>i.handle !== handle);
            render();
          });
        });

        root.querySelectorAll('[data-cart]').forEach((btn)=>{
          btn.addEventListener('click', async ()=>{
            const card = btn.closest('.card');
            const handle = card?.getAttribute('data-handle');
            const variantId = btn.getAttribute('data-cart');
            if(!variantId){ window.location.href = '/cart'; return; }
            const numericVariantId = variantId.split('/').pop();
            try{
              await fetch('/cart/add.js', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ id: Number(numericVariantId), quantity: 1 })
              });
              if (handle) {
                await fetch(base + '?action=toggle', {
                  method:'POST',
                  headers:{'Content-Type':'application/json'},
                  body: JSON.stringify({ visitorId, productHandle: handle })
                }).catch(()=>null);
                allItems = allItems.filter((i)=>i.handle !== handle);
              }
              window.location.href = '/cart';
            }catch{
              window.location.href = '/cart';
            }
          });
        });
      }

      document.getElementById('search').addEventListener('input', ()=>{ currentPage = 1; render(); });
      document.getElementById('sort').addEventListener('change', ()=>{ currentPage = 1; render(); });
      document.getElementById('prev-page').addEventListener('click', ()=>{ currentPage = Math.max(1, currentPage - 1); render(); });
      document.getElementById('next-page').addEventListener('click', ()=>{ currentPage += 1; render(); });
      document.getElementById('remove-all').addEventListener('click', async ()=>{
        if(!allItems.length) return;
        const copy = [...allItems];
        for (const item of copy) {
          await fetch(base + '?action=toggle', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ visitorId, productHandle: item.handle })
          }).catch(()=>null);
        }
        allItems = [];
        currentPage = 1;
        render();
      });

      fetch(base + '?action=list&visitorId=' + encodeURIComponent(visitorId))
        .then(r=>r.json())
        .then((data)=>{
          allItems = data.items || [];
          render();
        })
        .catch(()=>{
          document.getElementById('content').innerHTML = '<div class="empty">Unable to load wishlist now.</div>';
          document.getElementById('count').textContent = '0 items';
        });
    </script>
  </body>
</html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
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

    const product = await getProductPriceByHandle(admin, productHandle).catch(() => null);
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

