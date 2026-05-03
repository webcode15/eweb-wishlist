(function () {
  const root = document.getElementById("eww-wishlist-root");
  const shopDomain =
    root?.dataset?.shopDomain ||
    document.querySelector(".eww-wishlist-product-block")?.dataset?.shopDomain ||
    "";

  const proxyRoot = root?.dataset?.proxyRoot || "";
  const wishlistPageUrl = root?.dataset?.wishlistPageUrl || "/apps/wishlist-plus?action=page";
  const customerId = root?.dataset?.customerId || "";
  const customerEmail = root?.dataset?.customerEmail || "";

  let activeHandles = new Set();

  function appProxyFetchUrl(action, queryParams = {}) {
    if (!proxyRoot) return "";
    const url = new URL(proxyRoot);
    if (shopDomain) url.searchParams.set("shop", shopDomain);
    url.searchParams.set("action", action);
    Object.entries(queryParams).forEach(([k, v]) => {
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    });
    return url.toString();
  }

  function getLocalWishlist() {
    try {
      return JSON.parse(localStorage.getItem("eww_wishlist_items") || "[]");
    } catch {
      return [];
    }
  }

  function setLocalWishlist(items) {
    try {
      localStorage.setItem("eww_wishlist_items", JSON.stringify(items));
    } catch {
      // ignore
    }
  }

  function getGuestId() {
    const key = "eww_guest_id";
    let guestId = localStorage.getItem(key);
    if (!guestId) {
      guestId = "g_" + Math.random().toString(16).slice(2) + Date.now();
      localStorage.setItem(key, guestId);
    }
    return guestId;
  }

  function getVisitorId() {
    // Keep it simple but stable: for logged-in users, customerId is best.
    if (customerId) return `c:${customerId}`;
    if (customerEmail) return `e:${customerEmail}`;
    return `v:${getGuestId()}`;
  }

  function isActive(handle) {
    return activeHandles.has(handle);
  }

  function refreshAllUI(options) {
    // Update overlay icons
    document.querySelectorAll(".eww-wishlist-icon").forEach((btn) => {
      const handle = btn.dataset.handle;
      if (!handle) return;
      const heart = btn.querySelector(".eww-wishlist-heart");
      const active = isActive(handle);
      if (heart) heart.textContent = active ? "♥" : "♡";
      btn.style.setProperty(
        "color",
        active ? options.activeColor : options.color,
      );
      if (heart) heart.style.color = active ? options.activeColor : options.color;
    });

    // Update product button blocks
    document.querySelectorAll(".eww-wishlist-product-block").forEach((block) => {
      const handle = block.getAttribute("data-wishlist-handle");
      const button = block.querySelector(".eww-wishlist-btn");
      if (!handle || !button) return;
      const active = isActive(handle);
      button.classList.toggle("is-active", active);
      button.textContent = active
        ? "Wishlisted"
        : block.dataset.buttonLabel || "Add to wishlist";
    });
  }

  function showWishlistToast() {
    const existing = document.getElementById("eww-wishlist-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "eww-wishlist-toast";
    toast.className = "eww-wishlist-toast";
    toast.innerHTML =
      '<span>Added to wishlist.</span> <a href="' +
      wishlistPageUrl +
      '">Open My Wishlist</a>';
    document.body.appendChild(toast);

    window.setTimeout(() => {
      toast.classList.add("is-visible");
    }, 20);
    window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  async function fetchWishlistState(visitorId) {
    if (!proxyRoot) return;
    try {
      const res = await fetch(
        appProxyFetchUrl("state", { visitorId }),
        { method: "GET" },
      );
      const data = await res.json();
      const nextHandles = new Set(data.activeProductHandles || []);
      activeHandles = nextHandles;
      setLocalWishlist([...activeHandles]);
    } catch {
      // If proxy fails, fall back to localStorage state.
      activeHandles = new Set(getLocalWishlist());
    }
  }

  async function toggleOnBackend(visitorId, productHandle) {
    if (!proxyRoot) return null;
    const res = await fetch(appProxyFetchUrl("toggle"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorId,
        productHandle,
        // Customer fields are optional; proxy will use admin snapshot for price.
        customerId: customerId || null,
        customerEmail: customerEmail || null,
      }),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      console.warn("[eww-wishlist] toggle: non-JSON response", res.status, proxyRoot);
      return { ok: false };
    }
    if (!res.ok || !data?.ok) {
      console.warn("[eww-wishlist] toggle failed", res.status, data);
      return { ok: false, ...(data && typeof data === "object" ? data : {}) };
    }
    return data;
  }

  function createIconButton(handle, options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "eww-wishlist-icon";
    button.dataset.pos = options.position;
    button.dataset.handle = handle;

    const heart = document.createElement("span");
    heart.className = "eww-wishlist-heart";
    heart.textContent = isActive(handle) ? "♥" : "♡";
    button.appendChild(heart);

    const update = () => {
      const active = isActive(handle);
      heart.textContent = active ? "♥" : "♡";
      heart.style.color = active ? options.activeColor : options.color;
    };

    button.addEventListener("click", async function (event) {
      event.preventDefault();
      event.stopPropagation();

      const visitorId = getVisitorId();
      const wasActive = isActive(handle);
      // Optimistic UI update
      if (wasActive) activeHandles.delete(handle);
      else activeHandles.add(handle);
      setLocalWishlist([...activeHandles]);
      update();

      try {
        const data = await toggleOnBackend(visitorId, handle);
        if (data?.ok) {
          if (data.active) activeHandles.add(handle);
          else activeHandles.delete(handle);
          setLocalWishlist([...activeHandles]);
          update();
          if (data.active) showWishlistToast();
        } else {
          // Proxy/auth failed — revert optimistic UI so it matches the server.
          if (wasActive) activeHandles.add(handle);
          else activeHandles.delete(handle);
          setLocalWishlist([...activeHandles]);
          update();
        }
      } catch {
        if (wasActive) activeHandles.add(handle);
        else activeHandles.delete(handle);
        setLocalWishlist([...activeHandles]);
        update();
      }
    });

    update();
    return button;
  }

  function ensureRelative(container) {
    const style = window.getComputedStyle(container);
    if (style.position === "static") {
      container.style.position = "relative";
    }
  }

  function productHandleFromPath() {
    const pathname = window.location.pathname;
    const marker = "/products/";
    const idx = pathname.indexOf(marker);
    if (idx === -1) return null;
    return pathname
      .slice(idx + marker.length)
      .split("/")[0]
      ?.split("?")[0] || null;
  }

  function addToProductGrid(options) {
    const cards = document.querySelectorAll(
      '[data-product-handle], .product-card, .card-wrapper, .grid__item, li.grid__item, .card--media, .product-grid__item, .collection-product-card, [data-product-id]'
    );

    cards.forEach(function (card) {
      const handle =
        card.getAttribute("data-product-handle") ||
        card
          .querySelector('a[href*="/products/"]')
          ?.getAttribute("href")
          ?.split("/products/")[1]
          ?.split("?")[0];

      if (!handle || card.querySelector(".eww-wishlist-icon")) return;

      ensureRelative(card);
      card.appendChild(createIconButton(handle, options));
    });
  }

  function addToProductPage(options) {
    const handle = productHandleFromPath();
    if (!handle) return;

    const gallery =
      document.querySelector(".product") ||
      document.querySelector(".product__media-wrapper") ||
      document.querySelector(".product__column-sticky") ||
      document.querySelector('[class*="product__media"]') ||
      document.querySelector("#ProductInfo") ||
      document.querySelector("main");

    if (!gallery || gallery.querySelector(".eww-wishlist-icon")) return;

    ensureRelative(gallery);
    gallery.appendChild(createIconButton(handle, options));
  }

  function mountProductButtonBlocks(options) {
    const blocks = document.querySelectorAll(".eww-wishlist-product-block");

    blocks.forEach(function (block) {
      const handle = block.getAttribute("data-wishlist-handle");
      const button = block.querySelector(".eww-wishlist-btn");
      if (!handle || !button) return;

      button.addEventListener("click", async function (event) {
        event.preventDefault();
        event.stopPropagation();

        const visitorId = getVisitorId();
        const wasActive = isActive(handle);

        if (wasActive) activeHandles.delete(handle);
        else activeHandles.add(handle);
        setLocalWishlist([...activeHandles]);

        // Optimistic update
        const active = isActive(handle);
        button.classList.toggle("is-active", active);
        button.textContent = active
          ? "Wishlisted"
          : block.dataset.buttonLabel || "Add to wishlist";

        try {
          const data = await toggleOnBackend(visitorId, handle);
          if (data?.ok) {
            if (data.active) activeHandles.add(handle);
            else activeHandles.delete(handle);
            setLocalWishlist([...activeHandles]);
            if (data.active) showWishlistToast();
          } else {
            if (wasActive) activeHandles.add(handle);
            else activeHandles.delete(handle);
            setLocalWishlist([...activeHandles]);
          }
        } catch {
          if (wasActive) activeHandles.add(handle);
          else activeHandles.delete(handle);
          setLocalWishlist([...activeHandles]);
        }

        refreshAllUI(options);
      });

      // Initial sync
      const active = isActive(handle);
      button.classList.toggle("is-active", active);
      button.textContent = active
        ? "Wishlisted"
        : block.dataset.buttonLabel || "Add to wishlist";
    });
  }

  async function init() {
    const options = {
      position: root?.dataset?.iconPosition || "top-right",
      color: root?.dataset?.iconColor || "#4a4a4a",
      activeColor: root?.dataset?.iconActiveColor || "#d82c0d",
    };

    // Start with localStorage so UI doesn't flash.
    activeHandles = new Set(getLocalWishlist());

    mountProductButtonBlocks(options);

    if (root?.dataset?.showProductPage === "true") {
      addToProductPage(options);
    }

    if (root?.dataset?.showProductGrid === "true") {
      addToProductGrid(options);
      // Some themes render collection cards after first paint (lazy sections).
      window.setTimeout(function () {
        addToProductGrid(options);
      }, 600);
    }

    // Then sync real state from backend.
    await fetchWishlistState(getVisitorId());
    refreshAllUI(options);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
