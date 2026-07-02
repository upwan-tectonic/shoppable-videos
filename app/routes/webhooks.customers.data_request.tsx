import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Webhook: customers/data_request
 *
 * Mandatory compliance webhook. Shopify sends this when a customer requests
 * their data under GDPR/privacy regulations.
 *
 * Our app does not store any customer data — we only store video + product tag
 * metadata. We acknowledge the request and do nothing.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} — no customer data stored`);
  return new Response();
};
