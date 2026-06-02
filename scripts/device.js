import Webex from "./webex.js";

const SPEAKER_TRACK_SET_COMMAND = "Cameras.SpeakerTrack.Set";
const PRESET_LIST_COMMAND = "Camera.Preset.List";
const PRESET_STORE_COMMAND = "Camera.Preset.Store";
const PRESET_ACTIVATE_COMMAND = "Camera.Preset.Activate";
const CAMERA_RAMP_COMMAND = "Camera.Ramp";
const SELFVIEW_SET_COMMAND = "Video.Selfview.Set";

function stringifyStatusValue(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  return String(value);
}

function normalizeCameraId(value) {
  const number = Number(value);

  return Number.isFinite(number) && String(value).trim() !== ""
    ? number
    : value;
}

function cameraIdsMatch(left, right) {
  return String(left) === String(right);
}

function findCameraId(camera) {
  return camera.CameraId || camera.cameraId || camera.Id || camera.id;
}

function looksLikeSingleCamera(cameraValue) {
  return Boolean(
    cameraValue.Manufacturer ||
    cameraValue.manufacturer ||
    cameraValue.Model ||
    cameraValue.model ||
    cameraValue.Connected ||
    cameraValue.connected,
  );
}

function createCameraEntry(camera, id) {
  if (!camera || typeof camera !== "object") {
    return null;
  }

  return {
    id: normalizeCameraId(findCameraId(camera) || id),
    manufacturer: camera.Manufacturer || camera.manufacturer,
    model: camera.Model || camera.model,
    connected: stringifyStatusValue(camera.Connected || camera.connected),
    hardwareId: camera.HardwareId || camera.hardwareId,
    serial: camera.SerialNumber || camera.serial,
  };
}

function normalizeCameras(cameraValue) {
  if (Array.isArray(cameraValue)) {
    return cameraValue
      .map((camera, index) => createCameraEntry(camera, index + 1))
      .filter(Boolean);
  }

  if (!cameraValue || typeof cameraValue !== "object") {
    return [];
  }

  if (looksLikeSingleCamera(cameraValue)) {
    return [
      createCameraEntry(cameraValue, findCameraId(cameraValue) || 1),
    ].filter(Boolean);
  }

  return Object.entries(cameraValue)
    .map(([id, camera]) => createCameraEntry(camera, id))
    .filter(Boolean);
}

function formatBehaviorLabel(behavior) {
  return String(behavior || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

function mapSpeakerTrackBehaviors(behaviors = []) {
  const list = Array.isArray(behaviors)
    ? behaviors
    : [behaviors].filter(Boolean);

  return list.map((behavior) => ({
    id: behavior,
    behavior,
    label: formatBehaviorLabel(behavior),
  }));
}

function normalizePresetList(value) {
  const presets = value?.Preset || value?.preset || value?.Presets || value;

  if (!presets) {
    return [];
  }

  const list = Array.isArray(presets) ? presets : [presets];

  return list
    .map((preset) => ({
      presetId: String(
        preset?.PresetId ?? preset?.presetId ?? preset?.ListPosition ?? "",
      ),
      name: preset?.Name || preset?.name || "",
      cameraId: preset?.CameraId ?? preset?.cameraId,
      defaultPosition: preset?.DefaultPosition ?? preset?.defaultPosition,
      available: true,
    }))
    .filter((preset) => preset.presetId);
}

class Device {
  #webex;
  #deviceId;
  /** @type {Array<object>} */
  #cameras = [];
  #mainVideoSource;
  /** @type {Array<{id: string, behavior: string, label: string}>} */
  #speakerTrackModes = [];
  #cameraRampSpeed = 5;
  #selfviewMode;
  #selfviewPIPPosition;
  #selfviewFullscreenMode;

  /**
   * @param {Webex} webex
   * @param {string} deviceId
   */
  constructor(webex, deviceId) {
    if (!webex || !deviceId) {
      throw new Error("Webex client and device ID are required");
    }

    this.#webex = webex;
    this.#deviceId = deviceId;
  }

  get deviceId() {
    return this.#deviceId;
  }

  /** @deprecated Use getCameras() for normalized entries. */
  get cameras() {
    return this.#cameras;
  }

  get speakerTrackOptions() {
    return this.#speakerTrackModes;
  }

  get mainVideoSource() {
    return this.#mainVideoSource;
  }

  get selfviewMode() {
    return this.#selfviewMode;
  }

  get selfviewPIPPosition() {
    return this.#selfviewPIPPosition;
  }

  get selfviewFullscreenMode() {
    return this.#selfviewFullscreenMode;
  }

  get selectedCamera() {
    if (!this.#cameras.length) {
      return undefined;
    }

    if (this.#mainVideoSource === undefined || this.#mainVideoSource === null) {
      return this.#cameras[0];
    }

    return (
      this.#cameras.find((camera) =>
        cameraIdsMatch(camera.id, this.#mainVideoSource),
      ) || this.#cameras[0]
    );
  }

  getSelectedCameraId() {
    return this.selectedCamera?.id ?? this.#mainVideoSource;
  }

  getCameras() {
    const source = this.#mainVideoSource;

    return this.#cameras.map((camera) => ({
      ...camera,
      selected:
        source !== undefined &&
        source !== null &&
        cameraIdsMatch(camera.id, source),
    }));
  }

  async xapiCommand(commandName, args = {}, body) {
    return this.#webex.xapiCommand(this.#deviceId, commandName, args, body);
  }

  async xapiStatus(name) {
    return this.#webex.xapiStatus({ deviceId: this.#deviceId, name });
  }

  async xapiSchema(args = {}) {
    return this.#webex.xapiSchema({ deviceId: this.#deviceId, ...args });
  }

  /**
   * Sync available cameras and the active main video source in one status query.
   */
  async syncDeviceStatus() {
    const response = await this.xapiStatus([
      "Cameras.*",
      "Video.Input.MainVideoSource",
      "Video.Selfview.*",
    ]);
    const rawSource = response?.result?.Video?.Input?.MainVideoSource;

    this.#mainVideoSource =
      rawSource === undefined || rawSource === null || rawSource === ""
        ? undefined
        : normalizeCameraId(rawSource);
    this.#cameras = normalizeCameras(response?.result?.Cameras?.Camera);
    console.log("response?.result?.Video?.Selfview", response?.result
    );
    this.#selfviewMode = response?.result?.Video?.Selfview?.Mode;
    this.#selfviewPIPPosition = response?.result?.Video?.Selfview?.PIPPosition;
    this.#selfviewFullscreenMode = response?.result?.Video?.Selfview?.FullscreenMode;
    return {
      cameras: this.getCameras(),
      mainVideoSource: this.#mainVideoSource,
      selectedCamera: this.selectedCamera,
      selfviewMode: this.#selfviewMode,
      selfviewPIPPosition: this.#selfviewPIPPosition,
      selfviewFullscreenMode: this.#selfviewFullscreenMode,
    };
  }

  /**
   * SpeakerTrack.Set behaviors from device xAPI schema (set-only; no active state on personal devices).
   * @returns {Promise<Array<{id: string, behavior: string, label: string}>>}
   */
  async loadSpeakerTrackModes() {
    const response = await this.xapiSchema({
      command: SPEAKER_TRACK_SET_COMMAND,
    });
    const behaviors =
      response?.[0]?.commands?.[SPEAKER_TRACK_SET_COMMAND]?.arguments?.Behavior
        ?.schema?.enum || [];

    this.#speakerTrackModes = mapSpeakerTrackBehaviors(behaviors);
    return this.#speakerTrackModes;
  }

  async setSpeakerTrack(behavior) {
    return this.xapiCommand(SPEAKER_TRACK_SET_COMMAND, {
      Behavior: behavior,
    });
  }

  async listCameraPresets(cameraId) {
    const args = {};
    const resolvedCameraId = cameraId ?? this.getSelectedCameraId();

    if (resolvedCameraId !== undefined && resolvedCameraId !== null) {
      args.CameraId = resolvedCameraId;
    }

    const response = await this.xapiCommand(PRESET_LIST_COMMAND, args);

    return normalizePresetList(response?.result?.Preset ?? response?.Preset);
  }

  async storeCameraPreset(params) {
    return this.xapiCommand(PRESET_STORE_COMMAND, params);
  }

  async activateCameraPreset(presetId) {
    return this.xapiCommand(PRESET_ACTIVATE_COMMAND, { PresetId: presetId });
  }

  async startCameraRamp(axis, direction) {
    const cameraId = this.getSelectedCameraId();

    if (cameraId === undefined || cameraId === null) {
      throw new Error("No camera is selected for manual control");
    }

    const params = {
      CameraId: cameraId,
      [axis]: direction,
    };

    if (direction !== "Stop") {
      params[`${axis}Speed`] = this.#cameraRampSpeed;
    }

    return this.xapiCommand(CAMERA_RAMP_COMMAND, params);
  }

  async stopCameraRamp(axis) {
    return this.startCameraRamp(axis, "Stop");
  }

  /**
   * Set the selfview 
   * @param {object} params - 
   * @param {string} params.Mode - On or Off
   * @param {string} params.PIPPosition - PIPPosition = CenterLeft, CenterRight, LowerLeft, LowerRight, UpperCenter, UpperLeft, UpperRight
   * @param {string} params.FullscreenMode - Fullscreen = On or Off
   */
  async setSelfview(params) {
    await this.xapiCommand(SELFVIEW_SET_COMMAND, params);

    if (params.Mode !== undefined) {
      this.#selfviewMode = params.Mode;
    }

    if (params.PIPPosition !== undefined) {
      this.#selfviewPIPPosition = params.PIPPosition;
    }

    if (params.FullscreenMode !== undefined) {
      this.#selfviewFullscreenMode = params.FullscreenMode;
    }
  }

  /**
   * Toggle the selfview mode
   */
  async toggleSelfview() {
    return this.setSelfview({ Mode: this.#selfviewMode === "On" ? "Off" : "On" });
  }

  /**
   * Toggle the selfview fullscreen mode
   */
  async toggleSelfviewFullscreen() {
    console.log("toggleSelfviewFullscreen", this.#selfviewFullscreenMode);
    return this.setSelfview({ FullscreenMode: this.#selfviewFullscreenMode === "On" ? "Off" : "On" });
  }

  /**
   * Set the selfview PIP position
   * @param {string} PIPPosition - pip position = CenterLeft, CenterRight, LowerLeft, LowerRight, UpperCenter, UpperLeft, UpperRight
   */
  async setSelfviewPIPPosition(PIPPosition) {
    return this.setSelfview({ PIPPosition });
  }
}

export default Device;
