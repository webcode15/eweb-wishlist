import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function moneyToCents(amount) {
  if (amount === null || amount === undefined) return 0;
  const asNum = typeof amount === "number" ? amount : Number(String(amount));
  if (!Number.isFinite(asNum)) return 0;
  return Math.round(asNum * 100);
}

export const action = async ({ request }) => {
  const { payload, shop } = await authenticate.webhook(request);

  const order = payload?.order ?? payload;
  if (!order) return new Response();

  const customerId = order?.customer?.id;
  const customerEmail = order?.customer?.email;
  const visitorId = customerId ? `c:${customerId}` : customerEmail ? `e:${customerEmail}` : null;

  if (!visitorId) return new Response();

  const orderId = String(order.id ?? "");
  const orderName = order.name ?? order.order_number ?? null;
  const lineItems = order.line_items ?? [];

  const now = new Date();

  for (const li of lineItems) {
    const productNumericId = li.product_id ? String(li.product_id) : null;
    if (!productNumericId) continue;

    const revenueCents = moneyToCents(
      li?.price_set?.shop_money?.amount ??
        li?.price ??
        0,
    );

    // Only mark conversions for items that are currently in wishlist.
    const matches = await prisma.wishlistItem.findMany({
      where: {
        shopDomain: shop,
        visitorId,
        productNumericId,
        isActive: true,
      },
      select: { productHandle: true },
    });

    if (!matches.length) continue;

    // Persist conversion. Unique key prevents double-counting retries.
    await prisma.wishlistConversion.upsert({
      where: {
        shopVisitorOrderProduct: {
          shopDomain: shop,
          visitorId,
          orderId,
          productNumericId,
        },
      },
      update: {
        revenueCents,
        convertedAt: now,
      },
      create: {
        shopDomain: shop,
        visitorId,
        customerId: customerId ? String(customerId) : null,
        customerEmail: customerEmail || null,
        productHandle: matches[0]?.productHandle ?? null,
        productNumericId,
        orderId,
        orderName,
        revenueCents,
        convertedAt: now,
      },
    });

    // Mark wishlist item as inactive after purchase.
    await prisma.wishlistItem.updateMany({
      where: {
        shopDomain: shop,
        visitorId,
        productNumericId,
        isActive: true,
      },
      data: {
        isActive: false,
        removedAt: now,
      },
    });
  }

  return new Response();
};

