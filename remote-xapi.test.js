import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const device = {
  address: "10.1.1.1",
  username: "admin",
  password: "password",
};

const ipv6Device = {
  address: "2001:db8::10",
  username: "admin",
  password: "password",
};

describe("RemoteXAPI", () => {
  beforeEach(async () => {
    jest.resetModules();
    const { default: xapi } = await import("xapi");
    jest.clearAllMocks();
    xapi.removeAllListeners();
  });

  it("enables the RoomOS HTTP client when a connection is created", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");

    const remote = new RemoteXAPI(device);

    expect(remote).toBeInstanceOf(RemoteXAPI);
    expect(xapi.Config.HttpClient.Mode.set).toHaveBeenCalledWith("On");
    expect(xapi.Config.HttpClient.AllowInsecureHTTPS.set).toHaveBeenCalledWith("True");
  });

  it("validates required endpoint fields", async () => {
    const { RemoteXAPI } = await import("./remote-xapi.js");

    expect(() => new RemoteXAPI()).toThrow("endpoint not defined");
    expect(() => new RemoteXAPI({ username: "admin", password: "password" })).toThrow(
      "endpoint.address not defined",
    );
    expect(() => new RemoteXAPI({ address: "10.1.1.1", password: "password" })).toThrow(
      "endpoint.username not defined",
    );
    expect(() => new RemoteXAPI({ address: "10.1.1.1", username: "admin" })).toThrow(
      "endpoint.password not defined",
    );
  });

  it("builds a GET request and returns parsed status values", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    xapi.Command.HttpClient.Get.mockResolvedValueOnce({
      Body: "<Status><Audio><Volume>55</Volume></Audio></Status>",
    });

    const remote = new RemoteXAPI(device);
    const result = await remote.Status.Audio.Volume.get();

    expect(result).toBe(55);
    expect(xapi.Command.HttpClient.Get).toHaveBeenCalledWith(
      expect.objectContaining({
        Url: "https://10.1.1.1/getxml?location=/Status/Audio/Volume",
        AllowInsecureHTTPS: "True",
        ResultBody: "PlainText",
        Timeout: 2,
      }),
      undefined,
    );
    expect(xapi.Command.HttpClient.Get.mock.calls[0][0].Header).toEqual(
      expect.arrayContaining([
        `Authorization: Basic ${btoa("admin:password")}`,
        "Host: 10.1.1.1",
        "Accept: */*",
      ]),
    );
  });

  it("wraps IPv6 addresses in brackets for HTTP requests", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    xapi.Command.HttpClient.Get.mockResolvedValueOnce({
      Body: "<Status><Audio><Volume>25</Volume></Audio></Status>",
    });

    const remote = new RemoteXAPI(ipv6Device);

    await remote.Status.Audio.Volume.get();

    expect(xapi.Command.HttpClient.Get).toHaveBeenCalledWith(
      expect.objectContaining({
        Url: "https://[2001:db8::10]/getxml?location=/Status/Audio/Volume",
      }),
      undefined,
    );
  });

  it("builds a POST request and returns parsed command results", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    xapi.Command.HttpClient.Post.mockResolvedValueOnce({
      Body: '<Command><AudioVolumeSetResult status="OK"/></Command>',
    });

    const remote = new RemoteXAPI(device);
    const result = await remote.Command.Audio.VolumeSet({ Level: 35, Text: "Tom & Jerry" });

    expect(result).toEqual({ status: "OK" });
    expect(xapi.Command.HttpClient.Post).toHaveBeenCalledWith(
      expect.objectContaining({
        Url: "https://10.1.1.1/putxml",
      }),
      "<Command><Audio><VolumeSet><Level>35</Level><Text>Tom &amp; Jerry</Text></VolumeSet></Audio></Command>",
    );
    expect(xapi.Command.HttpClient.Post.mock.calls[0][0].Header).toEqual(
      expect.arrayContaining(["Content-Type: text/xml"]),
    );
  });

  it("returns configuration write responses instead of hanging", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    xapi.Command.HttpClient.Post.mockResolvedValueOnce({
      Body: '<Configuration><Audio><DefaultVolume status="OK">40</DefaultVolume></Audio></Configuration>',
    });

    const remote = new RemoteXAPI(device);
    const result = await remote.Config.Audio.DefaultVolume.set(40);

    expect(result).toEqual({
      Audio: {
        DefaultVolume: {
          status: "OK",
          _text: 40,
        },
      },
    });
    expect(xapi.Command.HttpClient.Post).toHaveBeenCalledWith(
      expect.objectContaining({
        Url: "https://10.1.1.1/putxml",
      }),
      "<Configuration><Audio><DefaultVolume>40</DefaultVolume></Audio></Configuration>",
    );
  });

  it("parses repeated primitive child elements without throwing", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    xapi.Command.HttpClient.Get.mockResolvedValueOnce({
      Body: "<Status><Favorites><Id>1</Id><Id>2</Id></Favorites></Status>",
    });

    const remote = new RemoteXAPI(device);
    const result = await remote.Status.Favorites.get();

    expect(result).toEqual({ Id: [1, 2] });
  });

  it("rejects with an unauthorized error when the device returns 401", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    xapi.Command.HttpClient.Get.mockRejectedValueOnce({
      data: { StatusCode: "401" },
      message: "Unauthorized by device",
    });

    const remote = new RemoteXAPI(device);

    await expect(remote.Status.Audio.Volume.get()).rejects.toEqual({ message: "Unauthorized" });
  });

  it("rejects unknown commands when the device returns an action error", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    xapi.Command.HttpClient.Post.mockResolvedValueOnce({
      Body: "<Command><ActionError><Reason>No action detected in document</Reason></ActionError></Command>",
    });

    const remote = new RemoteXAPI(device);

    await expect(remote.Command.FakeCommand()).rejects.toEqual({
      message: 'Method not found - Path: ["Command","FakeCommand"] - Device: 10.1.1.1',
    });
  });
});
