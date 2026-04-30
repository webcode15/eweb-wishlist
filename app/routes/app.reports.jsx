import { BlockStack, Card, InlineGrid, Page, Select, Text } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useCallback, useMemo, useState } from "react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session?.shop;
  if (!shopDomain) return { rows: [] };

  const items = await prisma.wishlistItem.findMany({
    where: { shopDomain },
    select: {
      productHandle: true,
      isActive: true,
      priceCents: true,
      compareAtPriceCents: true,
      currencyCode: true,
      addedAt: true,
      updatedAt: true,
    },
  });

  const conversions = await prisma.wishlistConversion.findMany({
    where: { shopDomain },
    select: {
      productHandle: true,
      revenueCents: true,
      convertedAt: true,
    },
  });

  return {
    rows: items,
    conversions,
  };
};

export default function ReportsPage() {
  const { rows, conversions } = useLoaderData();
  const [range, setRange] = useState("30");
  const shopify = useAppBridge();
  const currencyCode =
    rows.find((r) => r.currencyCode)?.currencyCode || "INR";
  const formatMoney = useCallback(
    (cents) =>
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: 2,
      }).format((cents || 0) / 100),
    [currencyCode],
  );

  const reportRows = useMemo(() => {
    const dayLimit = Number(range);
    const now = Date.now();
    const within = (dateLike) => {
      if (!dateLike) return false;
      const at = new Date(dateLike).getTime();
      return Number.isFinite(at) && now - at <= dayLimit * 24 * 60 * 60 * 1000;
    };

    const productMap = new Map();
    for (const item of rows || []) {
      if (!within(item.updatedAt || item.addedAt)) continue;
      const key = item.productHandle || "unknown-product";
      if (!productMap.has(key)) {
        productMap.set(key, {
          product: key,
          saved: 0,
          converted: 0,
          revenueCents: 0,
          wishlistValueCents: 0,
        });
      }
      const agg = productMap.get(key);
      if (item.isActive) agg.saved += 1;
      const effective = item.compareAtPriceCents || item.priceCents || 0;
      agg.wishlistValueCents += effective;
    }

    for (const c of conversions || []) {
      if (!within(c.convertedAt)) continue;
      const key = c.productHandle || "unknown-product";
      if (!productMap.has(key)) {
        productMap.set(key, {
          product: key,
          saved: 0,
          converted: 0,
          revenueCents: 0,
          wishlistValueCents: 0,
        });
      }
      const agg = productMap.get(key);
      agg.converted += 1;
      agg.revenueCents += c.revenueCents || 0;
    }

    return Array.from(productMap.values())
      .map((r) => {
        const conversionRate = r.saved > 0 ? ((r.converted / r.saved) * 100).toFixed(1) : "0.0";
        const effectiveRevenue = r.revenueCents || r.wishlistValueCents;
        return {
          product: r.product,
          saved: r.saved,
          converted: r.converted,
          conversion: `${conversionRate}%`,
          revenue: formatMoney(effectiveRevenue),
          effectiveRevenueCents: effectiveRevenue,
        };
      })
      .sort((a, b) => b.saved - a.saved)
      .slice(0, 20);
  }, [rows, conversions, range, formatMoney]);

  const handleExportCsv = () => {
    const rows = [
      ["Product", "Saved", "Conversion", "Revenue"],
      ...reportRows.map((r) => [r.product, String(r.saved), r.conversion, r.revenue]),
    ];

    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const v = cell ?? "";
            const needsQuotes = String(v).includes(",") || String(v).includes('"');
            const escaped = String(v).replace(/"/g, '""');
            return needsQuotes ? `"${escaped}"` : escaped;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wishlist-reports-${range}days.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    shopify?.toast?.show("CSV downloaded.");
  };

  const totalSaved = reportRows.reduce((sum, row) => sum + row.saved, 0);
  const totalRevenueCents = reportRows.reduce(
    (sum, row) => sum + row.effectiveRevenueCents,
    0,
  );
  const totalConversions = reportRows.reduce(
    (sum, row) => sum + (row.converted || 0),
    0,
  );
  const overallRate =
    totalSaved > 0 ? `${((totalConversions / totalSaved) * 100).toFixed(1)}%` : "0.0%";

  return (
    <Page
      title="Reports"
      primaryAction={{ content: "Export CSV", onAction: handleExportCsv }}
    >
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 1, md: 4 }} gap="400">
          <Card>
            <Text as="p" tone="subdued" variant="bodySm">
              Total wishlisted products
            </Text>
            <Text as="p" variant="headingLg">
              {totalSaved}
            </Text>
          </Card>
          <Card>
            <Text as="p" tone="subdued" variant="bodySm">
              Wishlist conversion rate
            </Text>
            <Text as="p" variant="headingLg">
              {overallRate}
            </Text>
          </Card>
          <Card>
            <Text as="p" tone="subdued" variant="bodySm">
              Revenue influenced
            </Text>
            <Text as="p" variant="headingLg">
              {formatMoney(totalRevenueCents)}
            </Text>
          </Card>
          <Card>
            <Select
              label="Range"
              options={[
                { label: "Last 7 days", value: "7" },
                { label: "Last 30 days", value: "30" },
                { label: "Last 90 days", value: "90" },
              ]}
              value={range}
              onChange={setRange}
            />
          </Card>
        </InlineGrid>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              Product performance
            </Text>
            <InlineGrid columns={{ xs: 1, md: 4 }} gap="300">
              <Text as="p" tone="subdued" variant="bodySm">
                Product
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Saved
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Conversion
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Revenue
              </Text>
              {reportRows.length === 0 ? (
                <Text as="p" variant="bodyMd">
                  No report data available for the selected range.
                </Text>
              ) : (
                reportRows.map((row) => (
                <InlineGrid key={row.product} columns={{ xs: 1, md: 4 }} gap="300">
                  <Text as="p" variant="bodyMd">
                    {row.product}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {row.saved}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {row.conversion}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {row.revenue}
                  </Text>
                </InlineGrid>
                ))
              )}
            </InlineGrid>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
