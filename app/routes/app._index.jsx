import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session?.shop;
  if (!shopDomain) return { dashboardCards: [], recentActivity: null };

  const [items, conversions] = await Promise.all([
    prisma.wishlistItem.findMany({
      where: { shopDomain },
      select: {
        visitorId: true,
        productHandle: true,
        priceCents: true,
        compareAtPriceCents: true,
        currencyCode: true,
        isActive: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    prisma.wishlistConversion.findMany({
      where: { shopDomain },
      select: { revenueCents: true },
    }),
  ]);

  const activeItems = items.filter((i) => i.isActive);
  const currencyCode =
    activeItems.find((i) => i.currencyCode)?.currencyCode ||
    items.find((i) => i.currencyCode)?.currencyCode ||
    "INR";
  const formatMoney = (cents) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format((cents || 0) / 100);
  const uniqueShoppers = new Set(activeItems.map((i) => i.visitorId)).size;
  const uniqueProducts = new Set(activeItems.map((i) => i.productHandle)).size;
  const wishlistValueCents = activeItems.reduce(
    (sum, i) => sum + (i.compareAtPriceCents || i.priceCents || 0),
    0,
  );
  const revenueCents = conversions.reduce((sum, c) => sum + (c.revenueCents || 0), 0);

  const recent = items[0];

  return {
    dashboardCards: [
      { title: "Shoppers", value: String(uniqueShoppers), meta: "added items to wishlist" },
      { title: "Products", value: String(uniqueProducts), meta: "in wishlists" },
      {
        title: "Value",
        value: formatMoney(wishlistValueCents),
        meta: "wishlist value",
      },
      {
        title: "Revenue",
        value: formatMoney(revenueCents),
        meta: "influenced revenue",
      },
    ],
    recentActivity: recent
      ? {
          productHandle: recent.productHandle,
          when: new Date(recent.updatedAt).toLocaleString(),
        }
      : null,
  };
};

export default function Index() {
  const { dashboardCards, recentActivity } = useLoaderData();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const handleViewStore = () => {
    // In embedded apps, the theme editor/online store is the closest "store view" that works reliably.
    window.open("/admin/themes", "_blank", "noopener,noreferrer");
    shopify.toast.show("Opened theme editor in a new tab");
  };

  const handleManageApp = () => {
    shopify.toast.show("Manage app: opening configurations");
    navigate("/app/configurations");
  };

  const handleCustomize = () => {
    shopify.toast.show("Customize: opening configurations");
    navigate("/app/configurations");
  };

  const handleLater = () => {
    shopify.toast.show("No worries — you can customize later in Configurations");
  };

  const handleGetHelp = () => {
    window.location.href = "mailto:support@ewebworld.com?subject=Wishlist%20Plus%20Help";
  };

  const handleKnowledgeBase = () => {
    window.open("https://shopify.dev/docs/apps", "_blank", "noopener,noreferrer");
  };

  const metrics = [
    {
      title: "Shoppers",
      subtitle: "Who interacted the most",
      items: ["ankit@example.com", "olive@example.com", "swety@example.com"],
    },
    {
      title: "Popular Products",
      subtitle: "Wishlisted by most users",
      items: ["Chamomile Oil", "Bouncy Bunny Backpack", "Poppy Penguin Pillow"],
    },
    {
      title: "Running out soon",
      subtitle: "Low in stock, high in demand",
      items: ["Sunny Socks", "Forest Fox Flask", "Poppy Penguin Pillow"],
    },
  ];

  return (
    <Page
      title="Wishlist Analytics Dashboard"
      primaryAction={{ content: "View store", onAction: handleViewStore }}
      secondaryActions={[
        { content: "Manage app", onAction: handleManageApp },
      ]}
    >
      <BlockStack gap="500">
        <Banner tone="success">Wishlist Plus is installed on your store.</Banner>

        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                Most Recent Activity
              </Text>
              <Text as="p" variant="bodyMd">
                {recentActivity ? (
                  <>
                    A shopper interacted with <strong>{recentActivity.productHandle}</strong>.
                  </>
                ) : (
                  <>No wishlist activity yet.</>
                )}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {recentActivity ? recentActivity.when : "—"}
              </Text>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                Performance
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Updated every 4-6 hours
              </Text>

              <InlineGrid columns={{ xs: 4, md: 2 }} gap="200">
                {dashboardCards.map((card) => (
                  <Box
                    key={card.title}
                    padding="300"
                    borderWidth="025"
                    borderRadius="200"
                  >
                    <BlockStack gap="100">
                      <Text as="p" tone="subdued" variant="bodySm">
                        {card.title}
                      </Text>
                      <Text as="p" variant="headingMd">
                        {card.value}
                      </Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        {card.meta}
                      </Text>
                    </BlockStack>
                  </Box>
                ))}
              </InlineGrid>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                What&apos;s next
              </Text>
              <Text as="p" variant="bodyMd">
                Make the Add to Wishlist button truly yours by customizing style
                and theme position.
              </Text>
              <InlineStack gap="200">
                <Button variant="primary" onClick={handleCustomize}>
                  Customize button
                </Button>
                <Button onClick={handleLater}>I&apos;ll do this later</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">
              Usage &amp; Quota
            </Text>
            <Text as="p" variant="bodyMd">
              Data unavailable. Your store is running smoothly.
            </Text>
          </BlockStack>
        </Card>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Metrics
          </Text>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
            {metrics.map((block) => (
              <Card key={block.title}>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    {block.title}
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {block.subtitle}
                  </Text>
                  <List type="bullet">
                    {block.items.map((item) => (
                      <List.Item key={item}>{item}</List.Item>
                    ))}
                  </List>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Support
          </Text>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Need Help?
                </Text>
                <Text as="p" variant="bodyMd">
                  Email us at ewebworldapp@gmail.com. We&apos;ll respond in 24-48
                  hours.
                </Text>
                <InlineStack>
                  <Button onClick={handleGetHelp}>Get help</Button>
                </InlineStack>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Visit Knowledge Base
                </Text>
                <Text as="p" variant="bodyMd">
                  Guides, tutorials, and best practices for wishlist optimization.
                </Text>
                <InlineStack>
                  <Button onClick={handleKnowledgeBase}>
                    Go to knowledge base
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </InlineGrid>
        </BlockStack>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
