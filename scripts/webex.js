import Http from "./http.js";

class Webex {
  #http;

  /**
   * Creates instance of Webex API Integration
   * @param {string} accessToken - Required auth
   * @param {?URL} baseUrl
   */
  constructor(accessToken, baseUrl = "https://webexapis.com/v1") {
    if (
      !accessToken ||
      typeof accessToken !== "string" ||
      !accessToken.trim()
    ) {
      throw new Error("Access token is required");
    }

    if (!baseUrl || typeof baseUrl !== "string" || !baseUrl.trim()) {
      throw new Error("Base URL is required");
    }

    this.#http = new Http(accessToken, baseUrl);
  }

  /**
   * List Devices
   * @param {?object} params - Optional: params for the request
   * @param {?number} params.max - Optional: Limit the maximum number of devices in the response.
   * @param {?number} params.start - Optional: Offset. Default is 0.
   * @param {?string} params.displayName - Optional: List devices with this display name.
   * @param {?string} params.personId - Optional: List devices by person ID.
   * @param {?string} params.workspaceId - Optional: List devices by workspace ID.
   * @param {?string} params.orgId - Optional: List devices in this organization. Only admin users of another organization (such as partners) may use this parameter.
   * @param {?string} params.connectionStatus - Optional: List devices with this connection status.
   * @param {?string} params.product - Optional: List devices with this product name. example ="DX-80", "RoomKit", "SX-80"
   * @param {?string} params.type - Optional: List devices with this type example = "roomdesk", "phone", "accessory", "webexgo", "unknown"
   * @param {?string} params.serial - Optional: List devices with this serial number.
   * @param {?string} params.tag - Optional: List devices which have a tag. Searching for multiple tags (logical AND) can be done by comma separating the tag values or adding several tag parameters.
   * @param {?string} params.software - Optional: List devices with this software version.
   * @param {?string} params.upgradeChannel - Optional: List devices with this upgrade channel.
   * @param {?string} params.errorCode - Optional: List devices with this error code.
   * @param {?string} params.capability - Optional: List devices with this capability. example = "xapi"
   * @param {?string} params.permission - Optional: List devices with this permission.
   * @param {?string} params.locationId - Optional: List devices by location ID
   * @param {?string} params.mac - Optional: List devices with this MAC address.
   * @param {?string} params.devicePlatform - Optional: List devices with this device platform.
   * @param {?string} params.plannedMaintenance - Optional: List devices with this planned maintenance.
   */
  async listDevices(params = {}, onProgress = null, onComplete = null) {
    console.log("Listing Devices");
    return this.#http.getPaginated("/devices", params, {
      onProgress,
      onComplete,
    });
  }

  /**
   * Execute xAPI Command
   * @param {string} deviceId - The unique identifier for the Webex RoomOS Device.
   * @param {string} commandName - Command to execute on the Webex RoomOS Device.
   * @param {object} args - Required: xAPI command arguments
   * @param {?string} body - Optional: xAPI command body, as a complex JSON object or as a string
   */
  async xapiCommand(deviceId, commandName, args = {}, body) {
    console.log("Execute xAPI Command:",commandName, args, body);
    return this.#http.post("/xapi/command/" + commandName, {
      deviceId,
      arguments:args,
      body,
    });
  }

  /**
   * Query xAPI Schema
   * @param {object} params - Required params
   * @param {string} params.deviceId - Required deviceId
   * @param {?string} params.status - Optional status path: eg: "Conference.*"
   * @param {?string} params.command - Optional command path: eg: "UserInterface.*""
   */
  async xapiSchema(params = {}) {
    console.log("Quering xAPI Schema:", params);
    return this.#http.getJson("/xapi/schema", params);
  }

  /**
   * Query xAPI Status
   * @param {string} deviceId - The unique identifier for the Webex RoomOS Device.
   * @param {string|string[]} name - A list of status expressions used to query the Webex RoomOS Device.
   */
  async xapiStatus(params = {}) {
    console.log("Quering xAPI Status:", params);
    return this.#http.getJson("/xapi/status", params);
  }

}

export default Webex;
