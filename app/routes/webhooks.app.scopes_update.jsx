import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;

  try {
    if (session?.id) {
      // updateMany avoids 500 when session row was already removed/replaced.
      await db.session.updateMany({
        where: { id: session.id },
        data: { scope: current.toString() },
      });
    } else {
      // For app-specific webhooks, session can be null; update by shop as fallback.
      await db.session.updateMany({
        where: { shop },
        data: { scope: current.toString() },
      });
    }
  } catch (error) {
    // Never fail webhook delivery for non-critical session sync.
    console.error("Failed to sync updated scopes in session table", error);
  }

  return new Response();
};
