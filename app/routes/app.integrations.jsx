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

const initialIntegrations = [
  {
    name: "Klaviyo",
    status: "Connected",
    description: "Sync wishlist events for browse and cart reminder emails.",
  },
  {
    name: "Meta Pixel",
    status: "Not connected",
    description: "Track wishlist add/remove events for retargeting campaigns.",
  },
  {
    name: "Google Analytics 4",
    status: "Connected",
    description: "Send wishlist engagement events for funnel analytics.",
  },
];

export default function IntegrationsPage() {
  const shopify = useAppBridge();
  const [integrations, setIntegrations] = useState(initialIntegrations);

  const handleToggleIntegration = (name) => {
    const existing = integrations.find((i) => i.name === name);
    const nextStatus =
      existing?.status === "Connected" ? "Not connected" : "Connected";

    setIntegrations((prev) =>
      prev.map((integration) => {
        if (integration.name !== name) return integration;
        return { ...integration, status: nextStatus };
      }),
    );

    shopify?.toast?.show(
      nextStatus === "Connected"
        ? `${name} connected (demo).`
        : `${name} disconnected (demo).`,
    );
  };

  return (
    <Page title="Integrations">
      <BlockStack gap="500">
        <Card>
          <Text as="p" variant="bodyMd">
            Connect marketing and analytics tools to activate wishlist behavior
            across channels.
          </Text>
        </Card>

        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          {integrations.map((integration) => (
            <Card key={integration.name}>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">
                  {integration.name}
                </Text>
                <Text
                  as="p"
                  tone={
                    integration.status === "Connected" ? "success" : "subdued"
                  }
                  variant="bodySm"
                >
                  {integration.status}
                </Text>
                <Text as="p" variant="bodySm">
                  {integration.description}
                </Text>
                <Button
                  variant="primary"
                  onClick={() => handleToggleIntegration(integration.name)}
                >
                  {integration.status === "Connected" ? "Manage" : "Connect"}
                </Button>
              </BlockStack>
            </Card>
          ))}
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
