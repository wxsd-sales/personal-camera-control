import Device from "./device.js";
import Webex from "./webex.js";
import OAuth, { isHostedWebApp } from "./oauth.js";
import {
  isLocalDevProxyEnabled,
  resolveWebexApiBaseUrl,
} from "./webex-config.js";
import {
  applyScreenshotMock,
  parseScreenshotViewFromHash,
} from "./screenshot-mock.js";
import { getDeviceThumbnailUrl } from "./device-visuals.js";
import { SELFVIEW_HEADSHOT_ILLUSTRATION_URL } from "./momentum-illustrations.js";

const oauth = new OAuth();

const PRESET_SLOTS = [1, 2, 3, 4, 5];

const app = {
  dom: {},
  webex: null,
  device: null,
  oauthCredentials: null,
  pendingDeviceId: null,
  personalDevices: [],
  selectedDeviceId: null,
  availableCameras: [],
  cameraModes: [],
  cameraPresets: [],
  savePresetPickerOpen: false,
  deviceSelectOpen: false,
  screenshotView: null,
  state: {
    webex: "idle",
    devices: "idle",
  },
};

window.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  app.dom = collectDom();
  bindUiEvents();
  exposeWindowApi();

  const screenshotView = parseScreenshotViewFromHash();
  if (screenshotView) {
    applyScreenshotMock(app, screenshotView);
    render();
    return;
  }

  initializeAuth();
  render();

  if (app.oauthCredentials) {
    await initializeWebex();
  }
}

function exposeWindowApi() {
  window.cameraControl = {
    get state() {
      return {
        ...app.state,
        screenshotView: app.screenshotView,
        signedIn: Boolean(app.oauthCredentials),
        selectedDeviceId: app.selectedDeviceId,
        personalDevices: app.personalDevices,
        mainVideoSource: app.device?.mainVideoSource,
        availableCameras: app.availableCameras,
        cameraModes: app.cameraModes,
        cameraPresets: app.cameraPresets,
      };
    },
    startWebexLogin,
    signOutOfWebex,
    selectDevice,
    refreshCameraState,
    reloadPersonalDevices: loadPersonalDevices,
  };
}

function collectDom() {
  return {
    loadingMessage: document.querySelector("#loadingMessage"),
    noDevicesMessage: document.querySelector("#noDevicesMessage"),
    deviceSelectRoot: document.querySelector("#deviceSelectRoot"),
    deviceSelectTrigger: document.querySelector("#deviceSelectTrigger"),
    deviceSelectList: document.querySelector("#deviceSelectList"),
    deviceSelectDetail: document.querySelector("#deviceSelectDetail"),
    retryDevicesBtn: document.querySelector("#retryDevicesBtn"),
    signInBtn: document.querySelector("#signInBtn"),
    signOutBtn: document.querySelector("#signOutBtn"),
    refreshCamerasBtn: document.querySelector("#refreshCamerasBtn"),
    cameraInventory: document.querySelector("#cameraInventory"),
    cameraModeControls: document.querySelector("#cameraModeControls"),
    presetControls: document.querySelector("#presetControls"),
    manualCameraControls: document.querySelector("#manualCameraControls"),
    cameraControlPanels: document.querySelector("#cameraControlPanels"),
    selfviewControlSection: document.querySelector(".selfview-control-section"),
    selfviewPIPSection: document.querySelector("#selfviewPIPSection"),
    selfviewPIPPosition: document.querySelector("#selfviewPIPPosition"),
    selfviewFullscreenPreview: document.querySelector(
      "#selfviewFullscreenPreview",
    ),
    selfviewPIPUnavailable: document.querySelector("#selfviewPIPUnavailable"),
    toggleSelfviewBtn: document.querySelector("#toggleSelfviewBtn"),
    toggleSelfviewFullscreenBtn: document.querySelector(
      "#toggleSelfviewFullscreenBtn",
    ),
    saveCameraViewBtn: document.querySelector("#saveCameraViewBtn"),
    savePresetControls: document.querySelector("#savePresetControls"),
    stepPanels: [...document.querySelectorAll("[data-step]")],
  };
}

function bindUiEvents() {
  app.dom.signInBtn?.addEventListener("click", startWebexLogin);
  app.dom.signOutBtn?.addEventListener("click", signOutOfWebex);
  app.dom.retryDevicesBtn?.addEventListener("click", () =>
    loadPersonalDevices(),
  );
  bindDeviceSelectEvents();
  app.dom.refreshCamerasBtn?.addEventListener("click", () =>
    refreshCameraState({ presets: true }),
  );
  app.dom.saveCameraViewBtn?.addEventListener("click", toggleSavePresetPicker);
  app.dom.toggleSelfviewBtn?.addEventListener("click", () => {
    runDeviceCommand(() => app.device.toggleSelfview(), {
      successMessage: `Selfview toggled to ${app.device?.selfviewMode || "unknown"}.`,
      presets: false,
    });
  });
  app.dom.toggleSelfviewFullscreenBtn?.addEventListener("click", () => {
    runDeviceCommand(() => app.device.toggleSelfviewFullscreen(), {
      successMessage: `Selfview fullscreen toggled to ${app.device?.selfviewFullscreenMode || "unknown"}.`,
      presets: false,
    });
  });
  app.dom.selfviewPIPPosition
    ?.querySelectorAll("[data-pip-position]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const position = button.dataset.pipPosition;

        if (!position) {
          return;
        }

        runDeviceCommand(() => app.device.setSelfviewPIPPosition(position), {
          successMessage: `Selfview PIP position set to ${position.replace(/([a-z])([A-Z])/g, "$1 $2")}.`,
          presets: false,
        });
      });
    });
  app.dom.manualCameraControls
    ?.querySelectorAll("[data-ramp-axis][data-ramp-direction]")
    .forEach(bindCameraRampButton);
}

function initializeAuth() {
  const auth = oauth.initialize();

  app.pendingDeviceId = auth.pendingDeviceId || null;

  if (!auth.ok) {
    setState({ webex: "needed" });
    addLog(
      auth.message || "Sign in with Webex to find your personal devices.",
      auth.reason === "expired" ||
        auth.reason === "oauth_error" ||
        auth.reason === "state_mismatch"
        ? "error"
        : "info",
    );
    return;
  }

  app.oauthCredentials = auth.credentials;
  oauth.saveCredentials(auth.credentials);
}

function startWebexLogin() {
  const deviceId =
    oauth.getHashDeviceId() || app.selectedDeviceId || app.pendingDeviceId;
  const errorMessage = oauth.startLogin({ deviceId });

  if (errorMessage) {
    setState({ webex: "blocked" });
    addLog(errorMessage, "error");
    return;
  }

  addLog("Redirecting to Webex sign-in.");
}

async function signOutOfWebex() {
  const accessToken = app.oauthCredentials?.accessToken;

  oauth.clearCredentials();
  app.oauthCredentials = null;
  app.pendingDeviceId = oauth.getHashDeviceId();
  app.webex = null;
  app.device = null;
  app.personalDevices = [];
  app.selectedDeviceId = null;
  app.availableCameras = [];
  app.cameraModes = [];
  app.cameraPresets = [];
  app.savePresetPickerOpen = false;
  setState({ webex: "needed", devices: "idle" });

  if (accessToken) {
    oauth.revokeToken(accessToken).catch((error) => {
      addLog(`Webex token revoke failed: ${formatError(error)}`, "error");
    });
  }

  addLog("Signed out of Webex.");
}

async function initializeWebex() {
  if (!app.oauthCredentials?.accessToken) {
    setState({ webex: "needed" });
    addLog("No Webex sign-in token is available for this session.", "error");
    return;
  }

  setState({ webex: "pending", devices: "pending" });

  try {
    const apiBaseUrl = resolveWebexApiBaseUrl();
    app.webex = new Webex(app.oauthCredentials.accessToken, apiBaseUrl);
    setState({ webex: "ready" });

    if (isLocalDevProxyEnabled()) {
      addLog(
        "Using local Webex API proxy (run: npm run dev:proxy). Requests go to http://127.0.0.1:8787.",
      );
    }

    addLog("Webex session ready. Loading personal devices.");
    await loadPersonalDevices();
  } catch (error) {
    setState({ webex: "error", devices: "error" });
    addLog(`Webex initialization failed: ${formatError(error)}`, "error");
  }
}

async function loadPersonalDevices() {
  if (!app.webex) {
    return;
  }

  setState({ devices: "pending" });

  if (app.dom.loadingMessage) {
    app.dom.loadingMessage.textContent =
      "Finding personal devices linked to your Webex account that support cloud camera control.";
  }

  try {
    const query = { capability: "xapi", type: "roomdesk" };

    const devices = await app.webex.listDevices(query);
    app.personalDevices = devices.filter(isPersonalModeDevice);

    if (!app.personalDevices.length) {
      setState({ devices: "unavailable" });
      if (app.dom.noDevicesMessage) {
        app.dom.noDevicesMessage.textContent =
          "No personal devices with cloud xAPI access were found for this account.";
      }
      addLog("No controllable personal devices were found.", "error");
      render();
      return;
    }

    if (app.dom.loadingMessage) {
      app.dom.loadingMessage.textContent =
        "Reading device status to prepare the device list.";
    }

    await syncPersonalDeviceStatuses(app.personalDevices);

    addLog(
      `Found ${app.personalDevices.length} personal device${app.personalDevices.length === 1 ? "" : "s"}: ${app.personalDevices.map(getDeviceDisplayName).join(", ")}.`,
    );

    const initialDeviceId = resolveInitialDeviceId(
      app.personalDevices,
      app.pendingDeviceId || oauth.getHashDeviceId(),
    );

    if (!initialDeviceId) {
      setState({ devices: "unavailable" });
      addLog("No device could be selected for camera control.", "error");
      render();
      return;
    }

    await selectDevice(initialDeviceId, { silent: true });
    app.pendingDeviceId = null;
    setState({ devices: "ready" });
    addLog(
      `Controlling ${getDeviceDisplayName(
        app.personalDevices.find((entry) => entry.id === initialDeviceId),
      )}.`,
    );
  } catch (error) {
    setState({ devices: "error" });
    addLog(`Failed to load personal devices: ${formatError(error)}`, "error");
  }

  render();
}

function isPersonalModeDevice(device) {
  return device.hasOwnProperty("personId");
}

async function syncPersonalDeviceStatuses(devices = []) {
  if (!app.webex || !devices.length) {
    return;
  }

  await Promise.all(
    devices.map(async (device) => {
      try {
        const handle = new Device(app.webex, device.id);
        device.byodLimitedActive = await handle.syncByodLimitedStatus();
      } catch {
        device.byodLimitedActive = undefined;
      }
    }),
  );
}

function isByodLimitedActive(device = {}) {
  console.log("device.byodLimitedActive", device?.byodLimitedActive);

  return normalizeStatusToken(device?.byodLimitedActive) == "true";
}

function isRoomBarDevice(device) {
  const product = String(device?.product || "").trim();
  const displayName = String(device?.displayName || "").trim();

  if (product.includes("Room Bar")) {
    return true;
  }

  return /^room bar$/i.test(displayName) && !/pro/i.test(displayName);
}

function pickDefaultDevice(devices = []) {
  if (!devices.length) {
    return null;
  }

  if (devices.length === 1) {
    return devices[0];
  }

  return devices.find(isRoomBarDevice) || devices[0];
}

function resolveInitialDeviceId(devices = [], preferredDeviceId = null) {
  if (
    preferredDeviceId &&
    devices.some((device) => device.id === preferredDeviceId)
  ) {
    return preferredDeviceId;
  }

  if (preferredDeviceId) {
    addLog("Bookmarked device is not available on this account.", "warning");
  }

  return pickDefaultDevice(devices)?.id || null;
}

async function selectDevice(deviceId, options = {}) {
  const deviceRecord = app.personalDevices.find(
    (entry) => entry.id === deviceId,
  );

  if (!deviceRecord) {
    addLog("Selected device is not available for this account.", "error");
    return;
  }

  app.selectedDeviceId = deviceId;
  app.device = new Device(app.webex, deviceId);
  app.savePresetPickerOpen = false;

  if (!options.silent) {
    addLog(`Switched to ${getDeviceDisplayName(deviceRecord)}.`);
  }

  oauth.setHashDeviceId(deviceId);
  app.pendingDeviceId = null;
  renderDevicePicker();
  await refreshCameraState({ presets: true });
}

async function refreshCameraState(options = {}) {
  console.log("Refreshing Camera Status");
  if (!app.device) {
    return;
  }

  if (app.dom.refreshCamerasBtn) {
    app.dom.refreshCamerasBtn.disabled = true;
  }

  try {
    await app.device.syncDeviceStatus();
    syncSelectedDeviceByodStatus();

    app.availableCameras = app.device.getCameras();

    try {
      app.cameraModes = await app.device.loadSpeakerTrackModes();
    } catch {
      app.cameraModes = [];
    }

    if (options.presets !== false) {
      await loadCameraPresets();
    }

    const selected = app.device.selectedCamera;
    const selectedLabel = selected
      ? formatCameraList([selected])
      : "no active camera";

    addLog(
      `Camera status refreshed for ${getSelectedDeviceName()}: ${formatCameraList(app.availableCameras)}. Active source: ${selectedLabel}.`,
    );
  } catch (error) {
    addLog(`Failed to refresh camera status: ${formatError(error)}`, "error");
  } finally {
    if (app.dom.refreshCamerasBtn) {
      app.dom.refreshCamerasBtn.disabled = !canControlCamera();
    }
    render();
  }
}

async function loadCameraPresets() {
  if (!app.device) {
    app.cameraPresets = [];
    return;
  }

  try {
    app.cameraPresets = await app.device.listCameraPresets();
  } catch (error) {
    app.cameraPresets = [];
    addLog(`Failed to load camera presets: ${formatError(error)}`, "error");
  }
}

async function runDeviceCommand(action, options = {}) {
  if (!app.device) {
    addLog("Select a device before sending camera commands.", "error");
    return false;
  }

  try {
    await action();

    if (options.successMessage) {
      addLog(options.successMessage);
    }

    if (options.refresh !== false) {
      await refreshCameraState({ presets: options.presets ?? false });
    } else {
      render();
    }

    return true;
  } catch (error) {
    addLog(`Camera command failed: ${formatError(error)}`, "error");
    return false;
  }
}

function normalizeStatusToken(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function isCameraConnected(camera) {
  const connected = normalizeStatusToken(camera.connected);

  return !connected || ["true", "connected", "yes"].includes(connected);
}

function getCameraDisplayLabel(camera, index) {
  const manufacturer = String(camera.manufacturer || "").trim();
  const model = String(camera.model || "").trim();

  if (
    manufacturer &&
    model &&
    normalizeStatusToken(manufacturer) === normalizeStatusToken(model)
  ) {
    return manufacturer;
  }

  const label = [manufacturer, model].filter(Boolean).join(" ");

  return label || `Camera ${camera.id || index + 1}`;
}

function formatCameraList(cameras = []) {
  if (!cameras.length) {
    return "no cameras reported";
  }

  return cameras
    .map((camera) => {
      const name = [camera.manufacturer, camera.model]
        .filter(Boolean)
        .join(" ");
      const label = name || `Camera ${camera.id || "unknown"}`;
      const status = camera.connected ? ` (${camera.connected})` : "";

      return `${label}${status}`;
    })
    .join(", ");
}

function canControlCamera() {
  return Boolean(
    app.device &&
    app.selectedDeviceId &&
    app.state.webex === "ready" &&
    app.state.devices === "ready",
  );
}

function setState(nextState) {
  app.state = {
    ...app.state,
    ...nextState,
  };
  render();
}

function render() {
  renderActiveStep();
  renderDevicePicker();
  renderCameraInventory();
  renderCameraModeControls();
  renderPresetControls();
  renderManualCameraControls();
  renderSelfviewControls();
  renderButtons();
}

function renderActiveStep() {
  const activeStep = getActiveStep();

  app.dom.stepPanels.forEach((panel) => {
    panel.hidden = panel.dataset.step !== activeStep;
  });
}

function getActiveStep() {
  if (app.screenshotView) {
    return app.screenshotView;
  }

  if (!app.oauthCredentials || app.state.webex === "needed") {
    return "signin";
  }

  if (
    ["pending", "blocked"].includes(app.state.webex) ||
    app.state.devices === "pending"
  ) {
    return "webexLoading";
  }

  if (app.state.devices === "unavailable" || app.state.devices === "error") {
    return "noDevices";
  }

  return "control";
}

function isDeviceOnline(device) {
  const status = normalizeStatusToken(device?.connectionStatus);

  return ["connected", "online", "true", "yes"].includes(status);
}

function bindDeviceSelectEvents() {
  const trigger = app.dom.deviceSelectTrigger;
  const list = app.dom.deviceSelectList;
  const root = app.dom.deviceSelectRoot;

  trigger?.addEventListener("click", () => {
    if (trigger.disabled) {
      return;
    }

    setDeviceSelectOpen(!app.deviceSelectOpen);
  });

  trigger?.addEventListener("keydown", (event) => {
    if (trigger.disabled) {
      return;
    }

    if (["Enter", " ", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      setDeviceSelectOpen(true);
    }
  });

  list?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-device-id]");

    if (!option) {
      return;
    }

    const deviceId = option.dataset.deviceId;

    if (!deviceId || deviceId === app.selectedDeviceId) {
      setDeviceSelectOpen(false);
      return;
    }

    void selectDevice(deviceId);
    setDeviceSelectOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (!app.deviceSelectOpen || root?.contains(event.target)) {
      return;
    }

    setDeviceSelectOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !app.deviceSelectOpen) {
      return;
    }

    setDeviceSelectOpen(false);
    trigger?.focus();
  });
}

function setDeviceSelectOpen(open) {
  app.deviceSelectOpen = open;

  const trigger = app.dom.deviceSelectTrigger;
  const list = app.dom.deviceSelectList;
  const root = app.dom.deviceSelectRoot;

  if (!trigger || !list) {
    return;
  }

  trigger.setAttribute("aria-expanded", open ? "true" : "false");
  list.hidden = !open;
  root?.classList.toggle("device-select--open", open);
}

function populateDeviceSelectRow(container, device, { placeholder = "" } = {}) {
  container.replaceChildren();

  if (placeholder) {
    const text = document.createElement("span");

    text.className = "device-select__placeholder";
    text.textContent = placeholder;
    container.appendChild(text);
    return;
  }

  const thumb = document.createElement("img");

  thumb.className = "device-select__thumb";
  thumb.src = getDeviceThumbnailUrl(device);
  thumb.alt = "";
  thumb.width = 48;
  thumb.height = 48;

  const label = document.createElement("span");

  label.className = "device-select__label";
  label.textContent = getDeviceDisplayName(device);

  const online = isDeviceOnline(device);

  container.append(thumb, label, createDeviceStatusIndicator(online));
}

function createDeviceStatusIndicator(online) {
  const wrapper = document.createElement("span");

  wrapper.className = "device-select__status";
  wrapper.setAttribute("aria-label", online ? "Online" : "Offline");

  const dot = document.createElement("span");

  dot.className = `device-status ${online ? "online" : "offline"}`;
  dot.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");

  label.className = "device-status__label";
  label.textContent = online ? "Online" : "Offline";

  wrapper.append(dot, label);
  return wrapper;
}

function renderDevicePicker() {
  const trigger = app.dom.deviceSelectTrigger;
  const list = app.dom.deviceSelectList;
  const detail = app.dom.deviceSelectDetail;

  if (!trigger || !list) {
    return;
  }

  const devices = app.personalDevices || [];
  const ready = app.state.devices === "ready" && devices.length > 0;

  trigger.disabled = !ready;

  if (!devices.length) {
    setDeviceSelectOpen(false);
    list.replaceChildren();
    populateDeviceSelectRow(trigger, null, {
      placeholder: ready ? "No devices available" : "Loading devices…",
    });

    if (detail) {
      detail.textContent = "Sign in to load your personal devices.";
    }

    return;
  }

  reconcileChildren(
    list,
    devices,
    (device) => `device-option:${device.id}`,
    createDeviceSelectOption,
    updateDeviceSelectOption,
  );

  const selected = devices.find((device) => device.id === app.selectedDeviceId);

  if (selected) {
    populateDeviceSelectRow(trigger, selected);
  } else {
    populateDeviceSelectRow(trigger, null, {
      placeholder: "Select a device…",
    });
  }

  if (detail) {
    if (!selected) {
      detail.textContent = "Select a personal device to control.";
    } else if (!isDeviceOnline(selected)) {
      detail.textContent = `${getDeviceDisplayName(selected)} is offline. Camera control may be unavailable.`;
    } else {
      detail.textContent = "Select a personal device to control.";
    }
  }
}

function createDeviceSelectOption() {
  const option = document.createElement("li");

  option.className = "device-select__option";
  option.role = "option";
  return option;
}

function updateDeviceSelectOption(option, device) {
  option.dataset.deviceId = device.id;
  option.setAttribute(
    "aria-selected",
    device.id === app.selectedDeviceId ? "true" : "false",
  );
  setClassNameIfChanged(
    option,
    device.id === app.selectedDeviceId
      ? "device-select__option device-select__option--selected"
      : "device-select__option",
  );
  populateDeviceSelectRow(option, device);
}

function renderButtons() {
  const signedIn = Boolean(app.oauthCredentials);
  const canControl = canControlCamera();

  if (app.dom.signInBtn) {
    const screenshotSignIn = app.screenshotView === "signin";
    app.dom.signInBtn.disabled = screenshotSignIn
      ? false
      : signedIn || !isHostedWebApp();
    app.dom.signInBtn.hidden = signedIn && !screenshotSignIn;
  }

  if (app.dom.signOutBtn) {
    app.dom.signOutBtn.hidden = !signedIn;
  }

  if (app.dom.refreshCamerasBtn) {
    app.dom.refreshCamerasBtn.disabled = !canControl;
  }

  app.dom.cameraModeControls?.querySelectorAll("button").forEach((button) => {
    button.disabled = !canControl;
  });
  app.dom.presetControls?.querySelectorAll("button").forEach((button) => {
    button.disabled = !canControl || button.dataset.available !== "true";
  });
  app.dom.manualCameraControls?.querySelectorAll("button").forEach((button) => {
    button.disabled = !canControl;
  });
  app.dom.selfviewPIPPosition
    ?.querySelectorAll("[data-pip-position]")
    .forEach((button) => {
      button.disabled = !canControl;
    });
  if (app.dom.toggleSelfviewBtn) {
    app.dom.toggleSelfviewBtn.disabled = !canControl;
  }
  if (app.dom.toggleSelfviewFullscreenBtn) {
    app.dom.toggleSelfviewFullscreenBtn.disabled = !canControl;
  }
}

function renderCameraInventory() {
  if (!app.dom.cameraInventory) {
    return;
  }

  const cameras = app.availableCameras;

  if (!cameras.length) {
    reconcileChildren(
      app.dom.cameraInventory,
      [{ message: "No camera status received yet." }],
      () => "empty",
      createCameraEmptyItem,
      updateCameraEmptyItem,
    );
    return;
  }

  reconcileChildren(
    app.dom.cameraInventory,
    cameras,
    (camera, index) => `camera:${camera.id || index + 1}`,
    createCameraInventoryItem,
    updateCameraInventoryItem,
  );
}

function renderCameraModeControls() {
  if (!app.dom.cameraModeControls) {
    return;
  }

  const byodLimitedModes = ["Manual", "BestOverview"];

  const modes = isByodLimitedActive(app?.device)
    ? app.cameraModes.filter(({ behavior }) =>
        byodLimitedModes.includes(behavior),
      )
    : app.cameraModes;

  if (!modes.length) {
    reconcileChildren(
      app.dom.cameraModeControls,
      [{ message: "No camera modes received yet." }],
      () => "empty",
      createControlEmptyItem,
      updateControlEmptyItem,
    );
    return;
  }

  reconcileChildren(
    app.dom.cameraModeControls,
    modes,
    (mode) => `mode:${mode.id}`,
    createCameraModeButton,
    updateCameraModeButton,
  );
}

function renderPresetControls() {
  if (!app.dom.presetControls) {
    return;
  }

  reconcileChildren(
    app.dom.presetControls,
    getPresetSlotItems(),
    (preset) => `preset:${preset.slot}`,
    createPresetButton,
    updatePresetButton,
  );
}

function renderManualCameraControls() {
  const panels = app.dom.cameraControlPanels;

  if (!panels) {
    return;
  }

  const visible = isManualCameraModeActive();

  panels.hidden = !visible;

  if (!visible) {
    app.savePresetPickerOpen = false;
  }

  if (app.dom.savePresetControls) {
    app.dom.savePresetControls.hidden = !app.savePresetPickerOpen || !visible;
    renderSavePresetControls();
  }
}

function renderSelfviewControls() {
  const selfviewAvailable = !isByodLimitedActive(app?.device);

  if (app.dom.selfviewControlSection) {
    app.dom.selfviewControlSection.hidden = !selfviewAvailable;
  }

  if (!selfviewAvailable) {
    return;
  }

  const canControl = canControlCamera() && isManualCameraModeActive();
  const activePosition = app.device?.selfviewPIPPosition ?? "";
  const isFullscreen = app.device?.selfviewFullscreenMode === "On";
  const pipGrid = app.dom.selfviewPIPPosition;
  const fullscreenPreview = app.dom.selfviewFullscreenPreview;
  const pipSection = app.dom.selfviewPIPSection;
  const unavailable = app.dom.selfviewPIPUnavailable;

  if (pipSection) {
    pipSection
      .closest(".selfview-control-surface")
      ?.classList.toggle("selfview-control-surface-fullscreen", isFullscreen);
  }

  if (pipGrid) {
    pipGrid.hidden = !canControl || isFullscreen;
  }

  if (fullscreenPreview) {
    fullscreenPreview.hidden = !canControl || !isFullscreen;
  }

  if (unavailable) {
    unavailable.hidden = canControl;
  }

  if (!canControl || !pipGrid) {
    return;
  }

  if (isFullscreen) {
    renderSelfviewFullscreenPreview(fullscreenPreview);
    clearSelfviewPipHeadshots(pipGrid);
    return;
  }

  if (fullscreenPreview) {
    fullscreenPreview.replaceChildren();
  }

  pipGrid.querySelectorAll("[data-pip-position]").forEach((button) => {
    const position = button.dataset.pipPosition;
    const isActive = position === activePosition;

    button.classList.toggle("selfview-pip-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");

    let headshot = button.querySelector(".selfview-pip-headshot");

    if (isActive) {
      if (!headshot) {
        headshot = createSelfviewHeadshot("selfview-pip-headshot");
        button.appendChild(headshot);
      }
    } else if (headshot) {
      headshot.remove();
    }
  });
}

function createSelfviewHeadshot(className) {
  const headshot = document.createElement("img");

  headshot.className = className;
  headshot.alt = "";
  headshot.decoding = "async";
  headshot.src = SELFVIEW_HEADSHOT_ILLUSTRATION_URL;
  return headshot;
}

function renderSelfviewFullscreenPreview(container) {
  if (!container) {
    return;
  }

  let headshot = container.querySelector(".selfview-fullscreen-headshot");

  if (!headshot) {
    headshot = createSelfviewHeadshot("selfview-fullscreen-headshot");
    container.appendChild(headshot);
  }
}

function clearSelfviewPipHeadshots(pipGrid) {
  pipGrid.querySelectorAll(".selfview-pip-headshot").forEach((headshot) => {
    headshot.remove();
  });
  pipGrid.querySelectorAll("[data-pip-position]").forEach((button) => {
    button.classList.remove("selfview-pip-active");
    button.removeAttribute("aria-pressed");
  });
}

function renderSavePresetControls() {
  if (!app.dom.savePresetControls) {
    return;
  }

  reconcileChildren(
    app.dom.savePresetControls,
    getPresetSlotItems(),
    (preset) => `save-preset:${preset.slot}`,
    createSavePresetButton,
    updateSavePresetButton,
  );
}

function isManualCameraModeActive() {
  return Boolean(app.device?.getSelectedCameraId());
}

function toggleSavePresetPicker() {
  app.savePresetPickerOpen = !app.savePresetPickerOpen;
  render();
}

function getPresetSlotItems() {
  const presetsBySlot = new Map(
    app.cameraPresets.map((preset) => [Number(preset.presetId), preset]),
  );

  return PRESET_SLOTS.map((slot) => ({
    ...(presetsBySlot.get(slot) || {}),
    slot,
    presetId: String(slot),
    available: presetsBySlot.has(slot),
  }));
}

function reconcileChildren(
  container,
  items,
  getKey,
  createElement,
  updateElement,
) {
  const existingByKey = new Map(
    [...container.children]
      .filter((element) => element.dataset.renderKey)
      .map((element) => [element.dataset.renderKey, element]),
  );
  const nextElements = items.map((item, index) => {
    const key = String(getKey(item, index));
    const element = existingByKey.get(key) || createElement(item, index);

    element.dataset.renderKey = key;
    updateElement(element, item, index);
    return element;
  });
  const nextElementSet = new Set(nextElements);

  [...container.children].forEach((element) => {
    if (!nextElementSet.has(element)) {
      element.remove();
    }
  });

  nextElements.forEach((element, index) => {
    const currentElement = container.children[index];

    if (currentElement !== element) {
      container.insertBefore(element, currentElement || null);
    }
  });
}

function createCameraEmptyItem() {
  const listItem = document.createElement("li");

  listItem.className = "camera-empty";
  return listItem;
}

function updateCameraEmptyItem(listItem, item) {
  setTextIfChanged(listItem, item.message);
  setClassNameIfChanged(listItem, "camera-empty");
}

function createCameraInventoryItem() {
  const listItem = document.createElement("li");
  const name = document.createElement("span");

  name.dataset.role = "camera-name";
  listItem.replaceChildren(name);
  return listItem;
}

function updateCameraInventoryItem(listItem, camera, index) {
  const name = getOrCreateRoleElement(listItem, "camera-name", "span");
  const connected = isCameraConnected(camera);
  const classes = ["camera-item"];

  if (camera.selected) {
    classes.push("camera-item-selected");
  }

  if (!connected) {
    classes.push("camera-item-disconnected");
  }

  setClassNameIfChanged(listItem, classes.join(" "));
  setTextIfChanged(name, getCameraDisplayLabel(camera, index));

  if (camera.selected) {
    listItem.setAttribute("aria-current", "true");
  } else {
    listItem.removeAttribute("aria-current");
  }

  if (!connected) {
    listItem.setAttribute("aria-disabled", "true");
  } else {
    listItem.removeAttribute("aria-disabled");
  }
}

function createControlEmptyItem(item) {
  return createEmptyControl(item.message);
}

function updateControlEmptyItem(empty, item) {
  setTextIfChanged(empty, item.message);
  setClassNameIfChanged(empty, "control-empty");
}

function createCameraModeButton() {
  const button = document.createElement("button");

  button.type = "button";
  button.addEventListener("click", () => {
    const mode = button.cameraMode;

    if (!mode) {
      return;
    }

    runDeviceCommand(() => app.device.setSpeakerTrack(mode.behavior), {
      successMessage: `Requested camera mode: ${mode.label}.`,
      presets: false,
    });
  });
  return button;
}

function updateCameraModeButton(button, mode) {
  button.cameraMode = mode;
  button.type = "button";
  setTextIfChanged(button, mode.label);
  setClassNameIfChanged(button, "control-button");
}

function createPresetButton() {
  const button = document.createElement("button");

  button.type = "button";
  button.addEventListener("click", () => {
    const preset = button.cameraPreset;

    if (!preset?.available) {
      return;
    }

    runDeviceCommand(
      () => app.device.activateCameraPreset(Number(preset.presetId)),
      {
        successMessage: `Requested camera preset: ${preset.name || preset.presetId}.`,
        presets: true,
      },
    );
  });
  return button;
}

function createSavePresetButton() {
  const button = document.createElement("button");

  button.type = "button";
  button.addEventListener("click", () => {
    const preset = button.cameraPreset;

    if (!preset) {
      return;
    }

    saveCameraPreset(preset.slot);
  });
  return button;
}

function updatePresetButton(button, preset) {
  const title = preset.available
    ? `Preset ${preset.slot}`
    : `Preset ${preset.slot} is not saved`;

  button.cameraPreset = preset;
  button.type = "button";
  button.dataset.available = preset.available ? "true" : "false";
  setTextIfChanged(button, `Preset ${preset.slot}`);
  setClassNameIfChanged(
    button,
    !preset.available
      ? "control-button control-button-unavailable"
      : normalizeStatusToken(preset.defaultPosition) === "true"
        ? "control-button control-button-secondary"
        : "control-button",
  );

  if (button.title !== title) {
    button.title = title;
  }
}

function updateSavePresetButton(button, preset) {
  const title = preset.available
    ? `Update preset ${preset.slot}`
    : `Save preset ${preset.slot}`;

  button.cameraPreset = preset;
  button.type = "button";
  button.dataset.available = preset.available ? "true" : "false";
  setTextIfChanged(button, String(preset.slot));
  setClassNameIfChanged(
    button,
    preset.available
      ? "save-preset-button save-preset-existing"
      : "save-preset-button",
  );

  if (button.title !== title) {
    button.title = title;
  }
}

function bindCameraRampButton(button) {
  let ramping = false;

  const start = (event) => {
    event.preventDefault();

    if (button.disabled || ramping) {
      return;
    }

    ramping = true;
    button.setPointerCapture?.(event.pointerId);
    startCameraRamp(button.dataset.rampAxis, button.dataset.rampDirection);
  };
  const stop = (event) => {
    if (!ramping) {
      return;
    }

    event?.preventDefault?.();
    ramping = false;
    stopCameraRamp(button.dataset.rampAxis);
  };

  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("lostpointercapture", stop);
  button.addEventListener("click", (event) => event.preventDefault());
  button.addEventListener("keydown", (event) => {
    if (![" ", "Enter"].includes(event.key) || button.disabled || ramping) {
      return;
    }

    event.preventDefault();
    ramping = true;
    startCameraRamp(button.dataset.rampAxis, button.dataset.rampDirection);
  });
  button.addEventListener("keyup", (event) => {
    if (![" ", "Enter"].includes(event.key)) {
      return;
    }

    stop(event);
  });
  button.addEventListener("blur", stop);
}

function startCameraRamp(axis, direction) {
  if (!app.device || !["Pan", "Tilt", "Zoom"].includes(axis) || !direction) {
    return false;
  }

  const commandDirection = getCameraRampCommandDirection(axis, direction);

  app.device.startCameraRamp(axis, commandDirection).catch((error) => {
    addLog(`Camera command failed: ${formatError(error)}`, "error");
  });

  return true;
}

function stopCameraRamp(axis) {
  if (!app.device || !["Pan", "Tilt", "Zoom"].includes(axis)) {
    return false;
  }

  app.device.stopCameraRamp(axis).catch((error) => {
    addLog(`Camera command failed: ${formatError(error)}`, "error");
  });

  return true;
}

function getCameraRampCommandDirection(axis, direction) {
  const flippedDirections = {
    Pan: {
      Left: "Right",
      Right: "Left",
    },
    Tilt: {
      Up: "Down",
      Down: "Up",
    },
  };

  return flippedDirections[axis]?.[direction] || direction;
}

async function saveCameraPreset(slot) {
  const existingPreset = app.cameraPresets.find(
    (preset) => Number(preset.presetId) === slot,
  );
  const cameraId = normalizeXapiNumber(
    existingPreset?.cameraId || app.device.getSelectedCameraId(),
  );
  const params = {
    CameraId: cameraId,
    DefaultPosition: "False",
    ListPosition: slot,
    Name: String(slot),
    PresetId: slot,
    TakeSnapshot: "True",
  };
  const sent = await runDeviceCommand(
    () => app.device.storeCameraPreset(params),
    {
      successMessage: `${existingPreset ? "Updated" : "Saved"} camera view as preset ${slot}.`,
      presets: true,
    },
  );

  if (!sent) {
    return false;
  }

  app.savePresetPickerOpen = false;
  render();

  return true;
}

function normalizeXapiNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) && String(value).trim() !== ""
    ? number
    : value;
}

function getOrCreateRoleElement(parent, role, tagName) {
  const selector = `[data-role="${role}"]`;
  const current = parent.querySelector(selector);

  if (current) {
    return current;
  }

  const element = document.createElement(tagName);

  element.dataset.role = role;
  parent.appendChild(element);
  return element;
}

function setTextIfChanged(element, text) {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

function setClassNameIfChanged(element, className) {
  if (element.className !== className) {
    element.className = className;
  }
}

function createEmptyControl(message) {
  const empty = document.createElement("p");

  empty.className = "control-empty";
  empty.textContent = message;
  return empty;
}

function addLog(message, level = "info") {
  const method =
    level === "error" ? "error" : level === "warning" ? "warn" : "log";
  console[method](message);
}

function syncSelectedDeviceByodStatus() {
  if (!app.device || !app.selectedDeviceId) {
    return;
  }

  const deviceRecord = app.personalDevices.find(
    (entry) => entry.id === app.selectedDeviceId,
  );

  if (deviceRecord) {
    deviceRecord.byodLimitedActive = app.device.byodLimitedActive;
  }
}

function getDeviceDisplayName(device = {}) {
  const baseName = String(device.displayName || "").trim() || "Unknown device";

  if (isRoomBarDevice(device) && isByodLimitedActive(device)) {
    return /\sbyod$/i.test(baseName) ? baseName : `${baseName} BYOD`;
  }

  return baseName;
}

function getSelectedDeviceName() {
  const device = app.personalDevices.find(
    (entry) => entry.id === app.selectedDeviceId,
  );

  return device ? getDeviceDisplayName(device) : "selected device";
}

function formatError(error) {
  const parts = [error?.message || error?.body?.message || String(error)];

  if (error?.trackingId) {
    parts.push(`(tracking: ${error.trackingId})`);
  }

  if (error?.status && !String(parts[0]).includes(String(error.status))) {
    parts.push(`[${error.status}]`);
  }

  return parts.join(" ");
}
