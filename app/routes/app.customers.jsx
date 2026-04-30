import {
  Banner,
  BlockStack,
  Card,
  InlineGrid,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useMemo, useState } from "react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session?.shop;

  if (!shopDomain) {
    return { customers: [] };
  }

  const items = await prisma.wishlistItem.findMany({
    where: { shopDomain },
    select: {
      visitorId: true,
      customerId: true,
      customerEmail: true,
      isActive: true,
      priceCents: true,
      compareAtPriceCents: true,
      currencyCode: true,
      updatedAt: true,
    },
  });

  const conversions = await prisma.wishlistConversion.findMany({
    where: { shopDomain },
    select: {
      visitorId: true,
      revenueCents: true,
    },
  });

  const now = Date.now();

  const relText = (at) => {
    if (!at) return "—";
    const createdAt = new Date(at);
    const diffMs = now - createdAt.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (!Number.isFinite(days)) return "—";
    if (days <= 0) return "Today";
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  };

  const daysAgo = (at) => {
    if (!at) return null;
    const createdAt = new Date(at);
    const diffMs = now - createdAt.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Number.isFinite(days) ? days : null;
  };

  // Group wishlist items by visitorId.
  const currencyCode =
    items.find((i) => i.currencyCode)?.currencyCode || "INR";
  const formatMoney = (cents) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format((cents || 0) / 100);

  const byVisitor = new Map();
  for (const item of items) {
    const key = item.visitorId;
    if (!byVisitor.has(key)) {
      byVisitor.set(key, {
        id: key,
        name: item.customerEmail || key,
        items: 0,
        valueCents: 0,
        lastActiveAt: item.updatedAt,
        daysAgo: daysAgo(item.updatedAt),
      });
    }

    const agg = byVisitor.get(key);
    if (item.updatedAt && item.updatedAt > agg.lastActiveAt) {
      agg.lastActiveAt = item.updatedAt;
      agg.daysAgo = daysAgo(item.updatedAt);
    }

    if (item.isActive) {
      agg.items += 1;
      const effective = item.compareAtPriceCents || item.priceCents || 0;
      agg.valueCents += effective;
    }
  }

  // Add revenue from conversions.
  const revenueByVisitor = new Map();
  for (const c of conversions) {
    const prev = revenueByVisitor.get(c.visitorId) || 0;
    revenueByVisitor.set(c.visitorId, prev + (c.revenueCents || 0));
  }

  const customers = Array.from(byVisitor.values()).map((c) => {
    // If order-to-wishlist conversions aren't enabled yet (webhook blocked),
    // fall back revenue to wishlist value so the dashboard stays meaningful.
    const revenueCents = revenueByVisitor.has(c.id)
      ? revenueByVisitor.get(c.id) || 0
      : c.valueCents;
    return {
      id: c.id,
      name: c.name,
      items: c.items,
      value: formatMoney(c.valueCents),
      revenueCents,
      revenue: formatMoney(revenueCents),
      last: relText(c.lastActiveAt),
      daysAgo: c.daysAgo ?? 999999,
    };
  });

  // Sort: most recent activity first.
  customers.sort((a, b) => a.daysAgo - b.daysAgo);

  return { customers, currencyCode };
};

export default function CustomersPage() {
  const { customers, currencyCode = "INR" } = useLoaderData();

  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("all");

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesQuery = !q || customer.name.toLowerCase().includes(q);
      // Segment is based on customer recency (createdAt), not wishlist activity yet.
      if (segment === "intent") {
        const isHigh = Number.isFinite(customer.daysAgo) ? customer.daysAgo <= 14 : true;
        return matchesQuery && isHigh;
      }
      if (segment === "inactive") {
        const isInactive = Number.isFinite(customer.daysAgo) ? customer.daysAgo > 14 : true;
        return matchesQuery && isInactive;
      }
      return matchesQuery;
    });
  }, [customers, query, segment]);

  const activeCount = useMemo(() => {
    return customers.filter((c) => (c.items || 0) > 0).length;
  }, [customers]);

  const activeCustomers = useMemo(() => {
    return customers.filter((c) => (c.items || 0) > 0);
  }, [customers]);

  const formatMoney = (cents) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format((cents || 0) / 100);

  return (
    <Page title="Customers">
      <BlockStack gap="500">
        <Banner tone="success">
          Wishlist analytics are now driven by backend events stored in Prisma DB.
        </Banner>

        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          <Card>
            <Text as="p" tone="subdued" variant="bodySm">
              Active shoppers
            </Text>
            <Text as="p" variant="headingLg">
              {activeCount}
            </Text>
          </Card>
          <Card>
            <Text as="p" tone="subdued" variant="bodySm">
              Avg items per wishlist
            </Text>
            <Text as="p" variant="headingLg">
              {activeCustomers.length
                ? (activeCustomers.reduce((sum, c) => sum + (c.items || 0), 0) /
                    Math.max(activeCustomers.length, 1)).toFixed(1)
                : "0.0"}
            </Text>
          </Card>
          <Card>
            <Text as="p" tone="subdued" variant="bodySm">
              Recoverable revenue
            </Text>
            <Text as="p" variant="headingLg">
              {(() => {
                const totalCents = activeCustomers.reduce(
                  (sum, c) => sum + (c.revenueCents || 0),
                  0,
                );
                const value = totalCents
                  ? formatMoney(totalCents)
                  : formatMoney(0);
                return value;
              })()}
            </Text>
          </Card>
        </InlineGrid>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              Customer wishlist activity
            </Text>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              <TextField
                label="Search customer"
                value={query}
                onChange={setQuery}
                placeholder="Search by email"
                autoComplete="off"
              />
              <Select
                label="Segment"
                options={[
                  { label: "All customers", value: "all" },
                  { label: "High intent", value: "intent" },
                  { label: "Inactive", value: "inactive" },
                ]}
                value={segment}
                onChange={setSegment}
              />
            </InlineGrid>
            <BlockStack gap="200">
              {filteredCustomers.map((customer) => (
                <Card key={customer.id ?? customer.name}>
                  <InlineGrid columns={{ xs: 1, md: 4 }} gap="300">
                    <Text as="p" variant="bodyMd">
                      {customer.name}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {customer.items} items
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {customer.value}
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      {customer.last}
                    </Text>
                  </InlineGrid>
                </Card>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
