import { useState, useCallback, useEffect, useRef } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useFetcher, useParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

// ─── Types ───────────────────────────────────────────────────────────────────
interface ProductTag {
  productId: string;
  productHandle: string;
  title: string;
  imageUrl?: string;
  timestamp: number;  // seconds into the video
  positionX: number;  // 0-100 percentage
  positionY: number;  // 0-100 percentage
}

// ─── Loader: Fetch video by handle (or empty for "new") ─────────────────────
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const handle = params.id;

  if (handle === "new") {
    return { video: null, isNew: true };
  }

  const response = await admin.graphql(
    `#graphql
      query GetVideo($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          id
          handle
          title: field(key: "title") { jsonValue }
          videoUrl: field(key: "video_url") { jsonValue }
          status: field(key: "status") { jsonValue }
          tags: field(key: "tags") { jsonValue }
        }
      }`,
    {
      variables: {
        handle: {
          type: "$app:shoppable_video",
          handle: handle,
        },
      },
    }
  );

  const json = await response.json();
  const node = json.data?.metaobjectByHandle;

  if (!node) {
    throw new Response("Video not found", { status: 404 });
  }

  return {
    video: {
      id: node.id,
      handle: node.handle,
      title: node.title?.jsonValue || "",
      videoUrl: node.videoUrl?.jsonValue || "",
      status: node.status?.jsonValue || "draft",
      tags: node.tags?.jsonValue || [],
    },
    isNew: false,
  };
};

// ─── Action: Create / Update / Delete video ─────────────────────────────────
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // ── Delete ────────────────────────────────────────────────────────────────
  if (intent === "delete") {
    const videoId = formData.get("videoId") as string;
    await admin.graphql(
      `#graphql
        mutation DeleteVideo($id: ID!) {
          metaobjectDelete(id: $id) {
            deletedId
            userErrors { field message }
          }
        }`,
      { variables: { id: videoId } }
    );
    return { deleted: true };
  }

  // ── Save (create or update) ───────────────────────────────────────────────
  const title = formData.get("title") as string;
  const videoUrl = formData.get("videoUrl") as string;
  const status = formData.get("status") as string;
  const tagsJson = formData.get("tags") as string;

  if (!title || !videoUrl) {
    return { error: "Title and Video URL are required." };
  }

  // Generate a URL-safe handle from the title
  const handle =
    (formData.get("handle") as string) ||
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .substring(0, 100);

  const fields = [
    { key: "title", value: title },
    { key: "video_url", value: videoUrl },
    { key: "status", value: status || "draft" },
    { key: "tags", value: tagsJson || "[]" },
  ];

  // metaobjectUpsert creates on first call, updates on subsequent calls for same handle
  const response = await admin.graphql(
    `#graphql
      mutation UpsertVideo($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject {
            id
            handle
          }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        handle: {
          type: "$app:shoppable_video",
          handle: handle,
        },
        metaobject: { fields },
      },
    }
  );

  const json = await response.json();
  const errors = json.data?.metaobjectUpsert?.userErrors;
  if (errors && errors.length > 0) {
    return { error: errors.map((e: any) => e.message).join(", ") };
  }

  const savedHandle = json.data?.metaobjectUpsert?.metaobject?.handle;
  return { success: true, handle: savedHandle };
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function VideoEditor() {
  const { video, isNew } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const params = useParams();

  const [title, setTitle] = useState(video?.title || "");
  const [videoUrl, setVideoUrl] = useState(video?.videoUrl || "");
  const [status, setStatus] = useState(video?.status || "draft");
  const [tags, setTags] = useState<ProductTag[]>(video?.tags || []);

  // Tag editing state
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
  const [tagTimestamp, setTagTimestamp] = useState("0");
  const [tagPositionX, setTagPositionX] = useState("50");
  const [tagPositionY, setTagPositionY] = useState("50");

  // Visual hotspot placement state
  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragIndex = useRef<number | null>(null);

  // Drag a numbered marker to set its product's on-screen position (0–100 %).
  const startDrag = useCallback(
    (index: number) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveTagIndex(index);
      dragIndex.current = index;

      const move = (ev: PointerEvent) => {
        const stage = stageRef.current;
        if (stage == null || dragIndex.current == null) return;
        const rect = stage.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100));
        setTags((prev) =>
          prev.map((t, i) =>
            i === dragIndex.current
              ? { ...t, positionX: Math.round(x), positionY: Math.round(y) }
              : t
          )
        );
      };
      const up = () => {
        dragIndex.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    []
  );

  // Capture the video's current playback time as a tag's hotspot timestamp.
  const setTimestampToCurrentFrame = useCallback((index: number) => {
    const v = videoRef.current;
    if (!v) return;
    const t = Math.max(0, Math.floor(v.currentTime));
    setTags((prev) => prev.map((tag, i) => (i === index ? { ...tag, timestamp: t } : tag)));
    setActiveTagIndex(index);
  }, []);

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  // Handle save success
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Video saved!");
      if (isNew && fetcher.data.handle) {
        navigate(`/app/videos/${fetcher.data.handle}`, { replace: true });
      }
    }
    if (fetcher.data?.deleted) {
      shopify.toast.show("Video deleted");
      navigate("/app", { replace: true });
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error);
    }
  }, [fetcher.data]);

  // ── Product picker via Shopify Resource Picker ─────────────────────────────
  const handleAddProduct = useCallback(async () => {
    try {
      const selected = await shopify.resourcePicker({
        type: "product",
        multiple: true,
        action: "select",
      });

      if (selected && selected.length > 0) {
        const newTags: ProductTag[] = selected
          .filter(
            (product: any) =>
              !tags.some((t) => t.productId === product.id)
          )
          .map((product: any) => ({
            productId: product.id,
            productHandle: product.handle,
            title: product.title,
            imageUrl: product.images?.[0]?.originalSrc || "",
            timestamp: 0,
            positionX: 50,
            positionY: 50,
          }));

        setTags((prev) => {
          const next = [...prev, ...newTags];
          // Select the first newly-added product so its marker is highlighted.
          if (newTags.length > 0) setActiveTagIndex(prev.length);
          return next;
        });
      }
    } catch (e) {
      // User cancelled the picker
      console.log("Resource picker cancelled");
    }
  }, [shopify, tags]);

  const handleRemoveTag = useCallback((index: number) => {
    setTags((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateTag = useCallback(
    (index: number) => {
      setTags((prev) =>
        prev.map((tag, i) =>
          i === index
            ? {
                ...tag,
                timestamp: parseFloat(tagTimestamp) || 0,
                positionX: parseFloat(tagPositionX) || 50,
                positionY: parseFloat(tagPositionY) || 50,
              }
            : tag
        )
      );
      setEditingTagIndex(null);
    },
    [tagTimestamp, tagPositionX, tagPositionY]
  );

  const handleSave = useCallback(() => {
    fetcher.submit(
      {
        intent: "save",
        title,
        videoUrl,
        status,
        tags: JSON.stringify(tags),
        handle: video?.handle || "",
      },
      { method: "POST" }
    );
  }, [fetcher, title, videoUrl, status, tags, video]);

  const handleDelete = useCallback(() => {
    if (video?.id && window.confirm("Delete this video? This cannot be undone.")) {
      fetcher.submit(
        { intent: "delete", videoId: video.id },
        { method: "POST" }
      );
    }
  }, [fetcher, video]);

  const handleToggleStatus = useCallback(() => {
    const newStatus = status === "live" ? "draft" : "live";
    // Prevent publishing with zero tags
    if (newStatus === "live" && tags.length === 0) {
      shopify.toast.show("Cannot set live: tag at least one product first.");
      return;
    }
    setStatus(newStatus);
    // Persist immediately — otherwise the status change lives only in local state
    // and the storefront wouldn't reflect it until the next manual Save.
    fetcher.submit(
      {
        intent: "save",
        title,
        videoUrl,
        status: newStatus,
        tags: JSON.stringify(tags),
        handle: video?.handle || "",
      },
      { method: "POST" }
    );
  }, [status, tags, shopify, fetcher, title, videoUrl, video]);

  const formatTimestamp = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <s-page
      heading={isNew ? "New Video" : title || "Edit Video"}
      backAction={{ url: "/app" }}
    >
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        {...(isLoading ? { loading: true } : {})}
      >
        Save
      </s-button>

      {!isNew && (
        <s-button
          slot="secondary-action"
          onClick={handleToggleStatus}
          tone={status === "live" ? "critical" : undefined}
        >
          {status === "live" ? "Set Draft" : "Set Live"}
        </s-button>
      )}

      {/* ── Video Details ─────────────────────────────────────────────── */}
      <s-section heading="Video details">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Title"
            value={title}
            onInput={(e: any) => setTitle(e.target.value)}
            placeholder="e.g. Spring Lookbook"
          />

          <s-text-field
            label="Video URL"
            value={videoUrl}
            onInput={(e: any) => setVideoUrl(e.target.value)}
            placeholder="https://cdn.shopify.com/videos/… or any hosted URL"
            helpText="Paste a direct link to an MP4 video file"
          />

          {videoUrl && (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <div
                ref={stageRef}
                style={{
                  position: "relative",
                  width: "100%",
                  maxWidth: "360px",
                  margin: "0 auto",
                  borderRadius: "8px",
                  overflow: "hidden",
                  lineHeight: 0,
                }}
              >
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  playsInline
                  style={{ width: "100%", display: "block", borderRadius: "8px" }}
                />
                {/* Overlay: numbered, draggable hotspot markers */}
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  {tags.map((tag, index) => (
                    <button
                      key={`marker-${tag.productId}-${index}`}
                      type="button"
                      title={`${tag.title} — drag to position`}
                      onPointerDown={startDrag(index)}
                      onClick={() => setActiveTagIndex(index)}
                      style={{
                        position: "absolute",
                        left: `${tag.positionX}%`,
                        top: `${tag.positionY}%`,
                        transform: "translate(-50%, -50%)",
                        pointerEvents: "auto",
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        border:
                          activeTagIndex === index
                            ? "2px solid #fff"
                            : "2px solid rgba(255,255,255,.9)",
                        background: activeTagIndex === index ? "#008060" : "rgba(0,0,0,.65)",
                        color: "#fff",
                        font: "700 13px/1 -apple-system, sans-serif",
                        cursor: "grab",
                        touchAction: "none",
                        boxShadow: "0 1px 4px rgba(0,0,0,.4)",
                        padding: 0,
                      }}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              </div>
              {tags.length > 0 && (
                <s-text variant="bodySm" tone="subdued">
                  Drag a numbered dot onto its product in the frame. Scrub the video
                  and use “Set to current frame” on a product below to time its hotspot.
                </s-text>
              )}
            </s-box>
          )}

          <s-badge tone={status === "live" ? "success" : undefined}>
            Status: {status === "live" ? "● Live" : "○ Draft"}
          </s-badge>
        </s-stack>
      </s-section>

      {/* ── Product Tags ──────────────────────────────────────────────── */}
      <s-section heading="Tag products">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Search your catalog and attach products. Then <strong>drag each numbered
            dot</strong> on the video above to place its hotspot, and use{" "}
            <strong>“Set to current frame”</strong> to time when it appears. Prefer
            typing exact values? Use “Edit values”.
          </s-paragraph>

          <s-button onClick={handleAddProduct}>
            🔎 Search catalog…
          </s-button>

          {tags.length === 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-paragraph>
                No products tagged yet. Use the button above to add products.
              </s-paragraph>
            </s-box>
          )}

          {tags.map((tag, index) => (
            <s-box
              key={`${tag.productId}-${index}`}
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background={activeTagIndex === index ? "subdued" : undefined}
              onClick={() => setActiveTagIndex(index)}
            >
              <s-stack direction="inline" gap="base" align="center" wrap={false}>
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: activeTagIndex === index ? "#008060" : "#1a1a1a",
                    color: "#fff",
                    font: "700 12px/1 -apple-system, sans-serif",
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </span>
                <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
                  <s-text fontWeight="bold">{tag.title}</s-text>
                  <s-text variant="bodyMd" tone="subdued">
                    @ {formatTimestamp(tag.timestamp)} · position ({tag.positionX}%, {tag.positionY}%)
                  </s-text>
                </s-stack>

                <s-button
                  variant="tertiary"
                  onClick={() => setTimestampToCurrentFrame(index)}
                >
                  Set to current frame
                </s-button>

                <s-button
                  variant="tertiary"
                  onClick={() => {
                    if (editingTagIndex === index) {
                      setEditingTagIndex(null);
                    } else {
                      setEditingTagIndex(index);
                      setTagTimestamp(String(tag.timestamp));
                      setTagPositionX(String(tag.positionX));
                      setTagPositionY(String(tag.positionY));
                    }
                  }}
                >
                  {editingTagIndex === index ? "Cancel" : "Edit values"}
                </s-button>

                <s-button
                  variant="tertiary"
                  tone="critical"
                  onClick={() => handleRemoveTag(index)}
                >
                  Remove
                </s-button>
              </s-stack>

              {editingTagIndex === index && (
                <s-box padding="base" background="subdued" borderRadius="base" style={{ marginTop: "8px" }}>
                  <s-stack direction="inline" gap="base" align="end">
                    <s-text-field
                      label="Timestamp (sec)"
                      type="number"
                      value={tagTimestamp}
                      onInput={(e: any) => setTagTimestamp(e.target.value)}
                      min="0"
                      step="1"
                    />
                    <s-text-field
                      label="Position X (%)"
                      type="number"
                      value={tagPositionX}
                      onInput={(e: any) => setTagPositionX(e.target.value)}
                      min="0"
                      max="100"
                    />
                    <s-text-field
                      label="Position Y (%)"
                      type="number"
                      value={tagPositionY}
                      onInput={(e: any) => setTagPositionY(e.target.value)}
                      min="0"
                      max="100"
                    />
                    <s-button onClick={() => handleUpdateTag(index)}>
                      Apply
                    </s-button>
                  </s-stack>
                </s-box>
              )}
            </s-box>
          ))}
        </s-stack>
      </s-section>

      {/* ── Aside: Danger zone ─────────────────────────────────────────── */}
      {!isNew && (
        <s-section slot="aside" heading="Danger zone">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Deleting a video removes it permanently and removes all product tags.
            </s-paragraph>
            <s-button tone="critical" onClick={handleDelete}>
              Delete this video
            </s-button>
          </s-stack>
        </s-section>
      )}

      {/* ── Aside: Embed instructions ──────────────────────────────────── */}
      {!isNew && (
        <s-section slot="aside" heading="Embed on storefront">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              To show this video on your storefront:
            </s-paragraph>
            <s-ordered-list>
              <s-list-item>Go to Online Store → Customize</s-list-item>
              <s-list-item>Add a section or block → "Shoppable Video Player"</s-list-item>
              <s-list-item>Select this video from the dropdown</s-list-item>
              <s-list-item>Save and publish</s-list-item>
            </s-ordered-list>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-text variant="bodyMd" tone="subdued">
                Handle: <code>{video?.handle}</code>
              </s-text>
            </s-box>
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
