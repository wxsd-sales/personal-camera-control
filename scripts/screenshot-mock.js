/** Hash views for headless screenshots: #view=signin|webexLoading|noDevices|control */

export const SCREENSHOT_VIEWS = [
  "signin",
  "webexLoading",
  "noDevices",
  "control",
];

export function parseScreenshotViewFromHash() {
  const raw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  if (!raw) {
    return null;
  }

  const view = new URLSearchParams(raw).get("view");

  return SCREENSHOT_VIEWS.includes(view) ? view : null;
}

const MOCK_DEVICE = {
  id: "mock-device-room-bar-001",
  displayName: "John Smith Room Bar",
  product: "Cisco Room Bar",
  connectionStatus: "connected",
  permissions: ["xapi"],
  byodLimitedActive: "True",
};

const MOCK_CAMERAS = [
  {
    id: 1,
    manufacturer: "Integrated Camera",
    model: "Integrated Camera",
    connected: "True",
    hardwareId: "mock-quad-cam",
    selected: true,
  },
  {
    id: 2,
    manufacturer: "Cisco",
    model: "Room Vision PTZ",
    connected: "True",
    hardwareId: "mock-desk-cam",
    selected: false,
  },
  {
    id: 3,
    manufacturer: "Cisco",
    model: "Desk Camera",
    connected: "False",
    hardwareId: "mock-unavailable-cam",
    selected: false,
  },
];

const MOCK_CAMERA_MODES = [
  { id: "Manual", behavior: "Manual", label: "Manual" },
  { id: "BestOverview", behavior: "BestOverview", label: "Best Overview" },
  { id: "Closeup", behavior: "Closeup", label: "Closeup" },
  { id: "PresenterTrack", behavior: "PresenterTrack", label: "Presenter Track" },
];

const MOCK_PRESETS = [
  {
    presetId: "1",
    name: "Wide shot",
    cameraId: 1,
    defaultPosition: "False",
    available: true,
  },
  {
    presetId: "2",
    name: "Presenter",
    cameraId: 1,
    defaultPosition: "True",
    available: true,
  },
  {
    presetId: "5",
    name: "Whiteboard",
    cameraId: 1,
    defaultPosition: "False",
    available: true,
  },
];

function createMockDeviceHandle() {
  let selfviewMode = "On";
  let selfviewPIPPosition = "UpperRight";
  let selfviewFullscreenMode = "Off";

  return {
    mainVideoSource: 1,
    get selfviewMode() {
      return selfviewMode;
    },
    get selfviewPIPPosition() {
      return selfviewPIPPosition;
    },
    get selfviewFullscreenMode() {
      return selfviewFullscreenMode;
    },
    getSelectedCameraId() {
      return 1;
    },
    async setSelfview(params) {
      if (params.Mode !== undefined) {
        selfviewMode = params.Mode;
      }

      if (params.PIPPosition !== undefined) {
        selfviewPIPPosition = params.PIPPosition;
      }

      if (params.FullscreenMode !== undefined) {
        selfviewFullscreenMode = params.FullscreenMode;
      }
    },
    async toggleSelfview() {
      selfviewMode = selfviewMode === "On" ? "Off" : "On";
    },
    async toggleSelfviewFullscreen() {
      selfviewFullscreenMode = selfviewFullscreenMode === "On" ? "Off" : "On";
    },
    async setSelfviewPIPPosition(position) {
      return this.setSelfview({ PIPPosition: position });
    },
  };
}

/**
 * @param {typeof app} app
 * @param {string} view
 */
export function applyScreenshotMock(app, view) {
  app.screenshotView = view;
  app.oauthCredentials = {
    accessToken: "screenshot-mock-token",
    expiresAt: Date.now() + 3_600_000,
    scope: "spark:kms",
    tokenType: "Bearer",
  };

  switch (view) {
    case "signin":
      app.oauthCredentials = null;
      app.personalDevices = [];
      app.selectedDeviceId = null;
      app.device = null;
      app.availableCameras = [];
      app.cameraModes = [];
      app.cameraPresets = [];
      app.state = { webex: "needed", devices: "idle" };
      break;

    case "webexLoading":
      app.personalDevices = [];
      app.selectedDeviceId = null;
      app.device = null;
      app.availableCameras = [];
      app.cameraModes = [];
      app.cameraPresets = [];
      app.state = { webex: "pending", devices: "pending" };
      break;

    case "noDevices":
      app.personalDevices = [];
      app.selectedDeviceId = null;
      app.device = null;
      app.availableCameras = [];
      app.cameraModes = [];
      app.cameraPresets = [];
      app.state = { webex: "ready", devices: "unavailable" };
      break;

    case "control":
      app.personalDevices = [MOCK_DEVICE];
      app.selectedDeviceId = MOCK_DEVICE.id;
      app.device = createMockDeviceHandle();
      app.availableCameras = MOCK_CAMERAS.map((camera) => ({ ...camera }));
      app.cameraModes = MOCK_CAMERA_MODES.map((mode) => ({ ...mode }));
      app.cameraPresets = MOCK_PRESETS.map((preset) => ({ ...preset }));
      app.state = { webex: "ready", devices: "ready" };
      break;

    default:
      break;
  }
}
