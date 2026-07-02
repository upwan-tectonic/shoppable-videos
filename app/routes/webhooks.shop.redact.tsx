import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Webhook: shop/redact
 *
 * Mandatory compliance webhook. Shopify sends this 48 hours after uninstall
 * to request erasure of all shop data.
 *
 * By that time, the app/uninstalled webhook has already deleted the session.
 * App-owned metaobjects are auto-deleted by Shopify on uninstall.
 * We acknowledge the request; no additional cleanup is needed.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} — session already purged on uninstall`);
  return new Response();
};
