import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useFetcher, useLoaderData } from "react-router";
import {
  Banner,
  BlockStack,
  Card,
  Checkbox,
  InlineGrid,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const DEFAULT_CONFIG = {
  enabled: true,
  showOnProduct: true,
  showOnGrid: true,
  iconStyle: "heart",
  iconPosition: "top-right",
  buttonLabel: "Add to Wishlist",
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session?.shop;

  if (!shopDomain) {
    return { config: DEFAULT_CONFIG };
  }

  if (!prisma.wishlistConfig) {
    return {
      config: DEFAULT_CONFIG,
      warning:
        "WishlistConfig model is not available in the current Prisma client. Restart dev server after Prisma generate.",
    };
  }

  const config = await prisma.wishlistConfig.findUnique({ where: { shopDomain } });

  return { config: config ?? DEFAULT_CONFIG, warning: null };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session?.shop;
  if (!shopDomain) {
    return Response.json({ ok: false, error: "Missing shop session" }, { status: 400 });
  }

  if (!prisma.wishlistConfig) {
    return Response.json(
      {
        ok: false,
        error:
          "WishlistConfig model unavailable in Prisma runtime. Restart dev server after Prisma generate.",
      },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const next = {
    enabled: Boolean(body.enabled),
    showOnProduct: Boolean(body.showOnProduct),
    showOnGrid: Boolean(body.showOnGrid),
    iconStyle: String(body.iconStyle || DEFAULT_CONFIG.iconStyle),
    iconPosition: String(body.iconPosition || DEFAULT_CONFIG.iconPosition),
    buttonLabel: String(body.buttonLabel || DEFAULT_CONFIG.buttonLabel),
  };

  await prisma.wishlistConfig.upsert({
    where: { shopDomain },
    create: { shopDomain, ...next },
    update: next,
  });

  return Response.json({ ok: true });
};

export default function ConfigurationsPage() {
  const { config, warning } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [enabled, setEnabled] = useState(config.enabled);
  const [showOnProduct, setShowOnProduct] = useState(config.showOnProduct);
  const [showOnGrid, setShowOnGrid] = useState(config.showOnGrid);
  const [iconStyle, setIconStyle] = useState(config.iconStyle);
  const [iconPosition, setIconPosition] = useState(config.iconPosition);
  const [buttonLabel, setButtonLabel] = useState(config.buttonLabel);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      shopify.toast.show("Settings saved.");
    }
  }, [fetcher.data, fetcher.state, shopify]);

  const handleSave = () => {
    const payload = {
      enabled,
      showOnProduct,
      showOnGrid,
      iconStyle,
      iconPosition,
      buttonLabel,
    };

    fetcher.submit(JSON.stringify(payload), {
      method: "POST",
      encType: "application/json",
    });
  };

  const handlePreviewTheme = () => {
    window.open("/admin/themes", "_blank", "noopener,noreferrer");
    shopify.toast.show("Preview theme: open Theme editor.");
  };

  return (
    <Page
      title="Configurations"
      primaryAction={{ content: "Save settings", onAction: handleSave }}
      secondaryActions={[
        { content: "Preview theme", onAction: handlePreviewTheme },
      ]}
    >
      <BlockStack gap="500">
        {warning ? (
          <Banner tone="warning">{warning}</Banner>
        ) : null}
        <Banner tone="info">
          Configure how wishlist appears on product page and collection grid.
        </Banner>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                Visibility controls
              </Text>
              <Checkbox
                label="Enable wishlist app embed"
                checked={enabled}
                onChange={setEnabled}
              />
              <Checkbox
                label="Show icon on product page"
                checked={showOnProduct}
                onChange={setShowOnProduct}
                disabled={!enabled}
              />
              <Checkbox
                label="Show icon on product grid"
                checked={showOnGrid}
                onChange={setShowOnGrid}
                disabled={!enabled}
              />
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                Visual settings
              </Text>
              <Select
                label="Icon style"
                options={[
                  { label: "Heart", value: "heart" },
                  { label: "Bookmark", value: "bookmark" },
                  { label: "Star", value: "star" },
                ]}
                value={iconStyle}
                onChange={setIconStyle}
                disabled={!enabled}
              />
              <Select
                label="Icon position"
                options={[
                  { label: "Top right", value: "top-right" },
                  { label: "Top left", value: "top-left" },
                  { label: "Bottom right", value: "bottom-right" },
                ]}
                value={iconPosition}
                onChange={setIconPosition}
                disabled={!enabled}
              />
              <TextField
                label="Button label"
                value={buttonLabel}
                onChange={setButtonLabel}
                autoComplete="off"
                disabled={!enabled}
              />
            </BlockStack>
          </Card>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
