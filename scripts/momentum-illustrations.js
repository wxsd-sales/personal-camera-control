export const MOMENTUM_ILLUSTRATIONS_CDN =
  "https://cdn.jsdelivr.net/npm/@momentum-design/illustrations@0.3.0/dist/svg";

export const SELFVIEW_HEADSHOT_ILLUSTRATION =
  "people-headshot-wavy-hair-l-oneninetwo-default.svg";

export function getMomentumIllustrationUrl(name) {
  return `${MOMENTUM_ILLUSTRATIONS_CDN}/${name}`;
}

export const SELFVIEW_HEADSHOT_ILLUSTRATION_URL = getMomentumIllustrationUrl(
  SELFVIEW_HEADSHOT_ILLUSTRATION,
);
