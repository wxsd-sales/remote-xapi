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

const bracketedIpv6Device = {
  address: "[2001:db8::10]",
  username: "admin",
  password: "password",
};

const responseDelayMs = {
  actionError: 13,
  command: 7,
  config: 11,
  ipv6: 5,
  queueGet: 17,
  queuePost: 3,
  repeatedStatus: 2,
  status: 9,
  timeout: 6,
  unauthorized: 4,
};

const offlineTimeoutError = {
  code: 1,
  data: {
    Message: "Request timed out",
    StatusCode: "0",
  },
  message: "Command returned an error.",
};

async function getRejectedError(promise) {
  let caughtError;
  try {
    await promise;
  } catch (error) {
    caughtError = error;
  }
  expect(caughtError).toBeDefined();
  return caughtError;
}

async function expectValidXapiPath(promise) {
  await expect(promise).resolves.toBeDefined();
}

async function expectInvalidXapiPath(promise) {
  const expectedError = await getRejectedError(promise);
  expect(expectedError).toEqual(
    expect.objectContaining({
      code: expect.any(Number),
      message: expect.any(String),
    }),
  );
  return expectedError;
}

function actionErrorBody(reason) {
  return `<Command><ActionError><Reason>${reason}</Reason></ActionError></Command>`;
}

function actionErrorBodyForXapiError(error) {
  const reason = error.code === 3 && error.message === "Unknown command"
    ? "No action detected in document"
    : error.message;
  return actionErrorBody(reason);
}

describe("RemoteXAPI", () => {
  beforeEach(async () => {
    jest.resetModules();
    const { default: xapi } = await import("xapi");
    xapi.reset();
  });

  it("enables the RoomOS HTTP client when a connection is created", async () => {
    const { default: xapi } = await import("xapi");
    await expectValidXapiPath(xapi.Config.HttpClient.Mode.set("On"));
    await expectValidXapiPath(xapi.Config.HttpClient.AllowInsecureHTTPS.set("True"));
    xapi.clearCallHistory();

    const { RemoteXAPI } = await import("./remote-xapi.js");

    const remote = new RemoteXAPI(device);

    expect(remote).toBeInstanceOf(RemoteXAPI);
    expect(xapi.Config.HttpClient.Mode.set).toHaveBeenCalledWith("On");
    expect(xapi.Config.HttpClient.AllowInsecureHTTPS.set).toHaveBeenCalledWith("True");
  });

  it("validates required device fields", async () => {
    const { RemoteXAPI } = await import("./remote-xapi.js");

    expect(() => new RemoteXAPI()).toThrow("device not defined");
    expect(() => new RemoteXAPI({ username: "admin", password: "password" })).toThrow(
      "device.address not defined",
    );
    expect(() => new RemoteXAPI({ address: "10.1.1.1", password: "password" })).toThrow(
      "device.username not defined",
    );
    expect(() => new RemoteXAPI({ address: "10.1.1.1", username: "admin" })).toThrow(
      "device.password not defined",
    );
  });

  it("builds a GET request and returns parsed status values", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    await expectValidXapiPath(xapi.Status.Audio.Volume.get());
    xapi.setHttpClientResponse("Get", {
      body: "<Status><Audio><Volume>55</Volume></Audio></Status>",
      delayMs: responseDelayMs.status,
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

  it("uses bracketed IPv6 addresses for HTTP requests with or without user-provided brackets", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    await expectValidXapiPath(xapi.Status.Audio.Volume.get());
    xapi.setHttpClientResponse("Get", {
      body: "<Status><Audio><Volume>25</Volume></Audio></Status>",
      delayMs: responseDelayMs.ipv6,
    });

    for (const testDevice of [ipv6Device, bracketedIpv6Device]) {
      const remote = new RemoteXAPI(testDevice);
      await remote.Status.Audio.Volume.get();
    }

    for (const [options] of xapi.Command.HttpClient.Get.mock.calls) {
      expect(options).toEqual(
        expect.objectContaining({
          Url: "https://[2001:db8::10]/getxml?location=/Status/Audio/Volume",
        }),
      );
      expect(options.Header).toEqual(expect.arrayContaining(["Host: [2001:db8::10]"]));
    }
  });

  it("builds a POST request and returns parsed command results", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    await expectValidXapiPath(xapi.Command.Audio.Volume.Set({ Level: 35 }));
    xapi.setHttpClientResponse("Post", {
      body: '<Command><AudioVolumeSetResult status="OK"/></Command>',
      delayMs: responseDelayMs.command,
    });

    const remote = new RemoteXAPI(device);
    const result = await remote.Command.Audio.Volume.Set({ Level: 35 });

    expect(result).toEqual({ status: "OK" });
    expect(xapi.Command.HttpClient.Post).toHaveBeenCalledWith(
      expect.objectContaining({
        Url: "https://10.1.1.1/putxml",
      }),
      "<Command><Audio><Volume><Set><Level>35</Level></Set></Volume></Audio></Command>",
    );
    expect(xapi.Command.HttpClient.Post.mock.calls[0][0].Header).toEqual(
      expect.arrayContaining(["Content-Type: text/xml"]),
    );
  });

  it("returns unknown command errors for invalid flattened command paths", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    const expectedError = await expectInvalidXapiPath(xapi.Command.Audio.VolumeSet({ Level: 35 }));
    xapi.setHttpClientResponse("Post", {
      body: actionErrorBodyForXapiError(expectedError),
      delayMs: responseDelayMs.actionError,
    });

    const remote = new RemoteXAPI(device);

    await expect(remote.Command.Audio.VolumeSet({ Level: 35 })).rejects.toEqual(expectedError);
    expect(xapi.Command.HttpClient.Post).toHaveBeenCalledWith(
      expect.objectContaining({
        Url: "https://10.1.1.1/putxml",
      }),
      "<Command><Audio><VolumeSet><Level>35</Level></VolumeSet></Audio></Command>",
    );
  });

  it("returns configuration write responses instead of hanging", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    await expectValidXapiPath(xapi.Config.Audio.DefaultVolume.set(100));
    xapi.setHttpClientResponse("Post", {
      body: '<Configuration><Audio><DefaultVolume status="OK">100</DefaultVolume></Audio></Configuration>',
      delayMs: responseDelayMs.config,
    });

    const remote = new RemoteXAPI(device);
    const result = await remote.Config.Audio.DefaultVolume.set(100);

    expect(result).toEqual({
      Audio: {
        DefaultVolume: {
          status: "OK",
          _text: 100,
        },
      },
    });
    expect(xapi.Command.HttpClient.Post).toHaveBeenCalledWith(
      expect.objectContaining({
        Url: "https://10.1.1.1/putxml",
      }),
      "<Configuration><Audio><DefaultVolume>100</DefaultVolume></Audio></Configuration>",
    );
  });

  it("parses repeated primitive child elements without throwing", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    await expectInvalidXapiPath(xapi.Status.Favorites.get());
    xapi.setHttpClientResponse("Get", {
      body: "<Status><Favorites><Id>1</Id><Id>2</Id></Favorites></Status>",
      delayMs: responseDelayMs.repeatedStatus,
    });

    const remote = new RemoteXAPI(device);
    const result = await remote.Status.Favorites.get();

    expect(result).toEqual({ Id: [1, 2] });
  });

  it("rejects with an unauthorized error when the device returns 401", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    await expectValidXapiPath(xapi.Status.Audio.Volume.get());
    xapi.setHttpClientResponse("Get", {
      body: "Unauthorized by device",
      delayMs: responseDelayMs.unauthorized,
      statusCode: 401,
    });

    const remote = new RemoteXAPI(device);

    await expect(remote.Status.Audio.Volume.get()).rejects.toEqual({ message: "Unauthorized" });
  });

  it("rejects unknown commands with the same error format as jest-mock-xapi", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    const expectedError = await expectInvalidXapiPath(xapi.Command.FakeCommand());
    xapi.setHttpClientResponse("Post", {
      body: actionErrorBodyForXapiError(expectedError),
      delayMs: responseDelayMs.actionError,
    });

    const remote = new RemoteXAPI(device);

    await expect(remote.Command.FakeCommand()).rejects.toEqual(expectedError);
  });

  it("rejects bad command parameters with the same error format as jest-mock-xapi", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    const expectedError = await expectInvalidXapiPath(xapi.Command.Audio.Volume.Set({ Level: "loud" }));
    xapi.setHttpClientResponse("Post", {
      body: actionErrorBodyForXapiError(expectedError),
      delayMs: responseDelayMs.actionError,
    });

    const remote = new RemoteXAPI(device);

    await expect(remote.Command.Audio.Volume.Set({ Level: "loud" })).rejects.toEqual(expectedError);
  });

  it("rejects with the HttpClient timeout error when the remote device is offline", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    await expectValidXapiPath(xapi.Status.Audio.Volume.get());
    xapi.setCommandHandler(["HttpClient", "Get"], () =>
      new Promise((_, reject) => {
        setTimeout(() => reject(offlineTimeoutError), responseDelayMs.timeout);
      }),
    );

    const remote = new RemoteXAPI(device);

    await expect(remote.Status.Audio.Volume.get()).rejects.toEqual(offlineTimeoutError);
    expect(xapi.Command.HttpClient.Get).toHaveBeenCalledWith(
      expect.objectContaining({
        Timeout: 2,
        Url: "https://10.1.1.1/getxml?location=/Status/Audio/Volume",
      }),
      undefined,
    );
  });

  it("serializes concurrent requests across varied HttpClient response delays", async () => {
    const { default: xapi } = await import("xapi");
    const { RemoteXAPI } = await import("./remote-xapi.js");
    await expectValidXapiPath(xapi.Status.Audio.Volume.get());
    await expectValidXapiPath(xapi.Command.Audio.Volume.Set({ Level: 10 }));
    await expectValidXapiPath(xapi.Command.Audio.Volume.Set({ Level: 20 }));
    xapi.setHttpClientResponse("Get", {
      body: "<Status><Audio><Volume>41</Volume></Audio></Status>",
      delayMs: responseDelayMs.queueGet,
    });
    xapi.setHttpClientResponse("Post", {
      body: '<Command><AudioVolumeSetResult status="OK"/></Command>',
      delayMs: responseDelayMs.queuePost,
    });

    const remote = new RemoteXAPI(device);
    const results = await Promise.all([
      remote.Status.Audio.Volume.get(),
      remote.Command.Audio.Volume.Set({ Level: 10 }),
      remote.Status.Audio.Volume.get(),
      remote.Command.Audio.Volume.Set({ Level: 20 }),
      remote.Status.Audio.Volume.get(),
    ]);

    expect(results).toEqual([41, { status: "OK" }, 41, { status: "OK" }, 41]);
    expect(xapi.Command.HttpClient.Get).toHaveBeenCalledTimes(3);
    expect(xapi.Command.HttpClient.Post).toHaveBeenCalledTimes(2);
  });
});
