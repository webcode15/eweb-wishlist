import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  BlockStack,
  Button,
  Card,
  InlineGrid,
  Page,
  Text,
} from "@shopify/polaris";

const initialAutomations = [
  {
    title: "Wishlist back in stock",
    detail: "Notify users when wishlisted item is back in stock.",
    status: "Active",
  },
  {
    title: "Wishlist price drop",
    detail: "Send alert when item price drops by configured percentage.",
    status: "Draft",
  },
  {
    title: "Wishlist reminder email",
    detail: "Re-engage users with products they saved but not purchased.",
    status: "Active",
  },
];

export default function MarketingsPage() {
  const shopify = useAppBridge();
  const [automations, setAutomations] = useState(initialAutomations);

  const handleCreateAutomation = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const nextTitle = `Wishlist automation ${hh}:${mm}`;
    setAutomations((prev) => [
      ...prev,
      {
        title: nextTitle,
        detail: "Draft automation created from dashboard.",
        status: "Draft",
      },
    ]);
    shopify?.toast?.show("Automation created (demo).");
  };

  const handleAutomationAction = (title, status) => {
    if (status === "Active") {
      shopify?.toast?.show(`${title}: Edit coming soon (demo).`);
      return;
    }

    setAutomations((prev) =>
      prev.map((a) => (a.title === title ? { ...a, status: "Active" } : a)),
    );
    shopify?.toast?.show(`${title}: Setup started (demo).`);
  };

  return (
    <Page
      title="Marketings"
      primaryAction={{ content: "Create automation", onAction: handleCreateAutomation }}
    >
      <BlockStack gap="500">
        <Card>
          <Text as="p" variant="bodyMd">
            Run campaigns based on wishlist behavior to recover demand and improve
            conversion.
          </Text>
        </Card>
        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          {automations.map((automation) => (
            <Card key={automation.title}>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">
                  {automation.title}
                </Text>
                <Text as="p" variant="bodySm">
                  {automation.detail}
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Status: {automation.status}
                </Text>
                <Button
                  onClick={() =>
                    handleAutomationAction(
                      automation.title,
                      automation.status,
                    )
                  }
                >
                  {automation.status === "Active" ? "Edit" : "Start setup"}
                </Button>
              </BlockStack>
            </Card>
          ))}
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
