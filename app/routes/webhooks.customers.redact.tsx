import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Webhook: customers/redact
 *
 * Mandatory compliance webhook. Shopify sends this when a merchant requests
 * erasure of a customer's data under GDPR.
 *
 * Our app does not store any customer data — we only store video + product tag
 * metadata. We acknowledge the request and do nothing.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} — no customer data stored`);
  return new Response();
};
