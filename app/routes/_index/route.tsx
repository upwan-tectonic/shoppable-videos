import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Shoppable Videos</h1>
        <p className={styles.text}>
          Attach products to your videos and let shoppers buy from the player —
          without leaving the video.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Manage videos</strong>. Upload or paste a hosted video URL and
            organize all your shoppable videos in one list.
          </li>
          <li>
            <strong>Tag products</strong>. Search your catalog and pin products to
            the video with per-tag timestamp and on-screen position.
          </li>
          <li>
            <strong>Sell on the storefront</strong>. Drop the theme app block on any
            page — shoppers tap a hotspot and add to cart in place.
          </li>
        </ul>
      </div>
    </div>
  );
}
