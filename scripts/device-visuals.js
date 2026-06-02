const BRAND_VISUALS_BASE =
  "https://cdn.jsdelivr.net/npm/@momentum-design/brand-visuals@0.36.0/dist/svg";

const DEFAULT_THUMBNAIL = "device-thumbnails-webex-room-kit.svg";

/** More specific product patterns first. */
const THUMBNAIL_RULES = [
  { test: /room bar/i, slug: "device-thumbnails-webex-room-bar" },
  { test: /desk pro/i, slug: "device-thumbnails-deskpro" },
  { test: /codec pro g2|codec pro g two/i, slug: "device-thumbnails-codec-pro-gtwo" },
  { test: /codec plus|codec pro/i, slug: "device-thumbnails-webex-codec-plus" },
  { test: /room kit plus/i, slug: "device-thumbnails-webex-room-kit-plus" },
  { test: /room kit mini/i, slug: "device-thumbnails-webex-room-kit-mini" },
  { test: /room kit|roomkit/i, slug: "device-thumbnails-webex-room-kit" },
  { test: /room 55|room55|webex room 55/i, slug: "device-thumbnails-webex-room-fivefive" },
  { test: /board 55|webex board/i, slug: "device-thumbnails-webex-board-fivefive" },
  { test: /cisco desk|^desk$/i, slug: "device-thumbnails-deskpro" },
];

function getDeviceLabel(device = {}) {
  return [
    device.product,
    device.displayName,
    device.productName,
    device.metadata?.userAssignedName,
    device.identity?.displayName,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * @param {object} device Webex device record or mock device
 * @returns {string} CDN URL for a Momentum device thumbnail SVG
 */
export function getDeviceThumbnailUrl(device = {}) {
  const label = getDeviceLabel(device);
  const rule = THUMBNAIL_RULES.find((entry) => entry.test.test(label));
  const slug = rule?.slug ?? DEFAULT_THUMBNAIL;

  return `${BRAND_VISUALS_BASE}/${slug}.svg`;
}
