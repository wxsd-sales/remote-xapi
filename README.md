# Remote xAPI

JavaScript helper library for Cisco RoomOS macros that send xAPI status, configuration, and command requests to remote RoomOS devices over HTTPS using the local HttpClient xCommands.

Key features:
- HTTP request queueing to prevent the macro runtime from exhausting the limited number of available HttpClient request slots.
- Built-in XML-to-JSON style parsing for RoomOS xAPI responses, which is needed because the Cisco Collaboration macro JavaScript runtime does not include a native XML parsing library.

## Overview

`remote-xapi.js` wraps remote RoomOS xAPI calls behind a simple JavaScript interface that feels similar to the local `xapi` object used in macros. The library automatically decides whether a request should be sent as a `getxml` or `putxml` call, then sends it to the remote endpoint with the local device's `HttpClient`.

To keep macro execution reliable, requests are placed onto a queue and processed one at a time. This helps avoid failures caused by opening too many concurrent `HttpClient` requests from the RoomOS macro runtime.

The library also parses XML responses into JavaScript objects and primitive values so macro code can work with JSON-like results instead of raw XML strings.

## Setup

### Prerequisites

- A Cisco RoomOS device with Macro Editor access.
- `HttpClient` enabled on the local RoomOS device running the macro.
- Network connectivity from the local RoomOS device to each remote RoomOS endpoint.
- Credentials for the remote RoomOS device API account.
- A copy of `remote-xapi.js` from this repository.

### Installation Steps

1. Open the RoomOS device web interface, then go to `Customization > Macro Editor`.
2. Create a new macro named `remote-xapi`.
3. Paste the contents of [remote-xapi.js](/Users/wimills/Documents/GitHub/remote-xapi/remote-xapi.js:1) into that macro and save it.
4. Set the `remote-xapi` macro to `On` so the library is loaded by the RoomOS macro runtime.
5. Create a second macro for your application logic, for example `remote-xapi-demo`.
6. Import the library macro in your application macro:

```js
import { RemoteXAPI } from './remote-xapi';
```

7. Create a remote endpoint definition with the target device address and credentials:

```js
const remoteCodec = new RemoteXAPI({
  address: '10.10.10.50',
  username: 'admin',
  password: 'password',
});
```

8. Save and enable your application macro.

## Demo

The example below shows how to connect to a remote RoomOS device, read a status value, update a configuration value, and send a command.

```js
import xapi from 'xapi';
import { RemoteXAPI } from './remote-xapi';

const remoteCodec = new RemoteXAPI({
  address: '10.10.10.50',
  username: 'admin',
  password: 'password',
});

async function syncRemoteVolume() {
  try {
    const volume = await remoteCodec.Status.Audio.Volume.get();
    console.log(`Remote volume is ${volume}`);

    if (volume < 40) {
      await remoteCodec.Config.Audio.DefaultVolume.set(40);
      console.log('Remote default volume updated to 40');
    }

    await remoteCodec.Command.UserInterface.Message.Alert.Display({
      Title: 'Remote xAPI Demo',
      Text: 'Remote codec connected successfully',
      Duration: 5,
    });
  } catch (error) {
    console.error(`Remote xAPI request failed: ${error.message}`);
  }
}

xapi.Event.SystemUnit.State.NumberOfActiveCalls.on((activeCalls) => {
  if (activeCalls > 0) {
    syncRemoteVolume();
  }
});
```

## Notes

- `Status` requests return parsed values such as strings, numbers, booleans, arrays, or objects depending on the XML returned by the remote endpoint.
- `Config` writes are sent with `putxml` and return the parsed RoomOS response body.
- `Command` requests automatically build the expected XML payload and return the parsed `*Result` object when present.

## License

All contents are licensed under the MIT license. Please see [license](LICENSE) for details.

## Disclaimer

Everything included is for demo and Proof of Concept purposes only. Use of the site is solely at your own risk. This site may contain links to third party content, which we do not warrant, endorse, or assume liability for. These demos are for Cisco Webex usecases, but are not Official Cisco Webex Branded demos.

## Questions

Please contact the WXSD team at [wxsd@external.cisco.com](mailto:wxsd@external.cisco.com?subject=remote-xapi) for questions. Or, if you're a Cisco internal employee, reach out to us on the Webex App via our bot (`globalexpert@webex.bot`). In the "Engagement Type" field, choose the "API/SDK Proof of Concept Integration Development" option to make sure you reach our team.

*For more demos & PoCs like this, check out our [Webex Labs site](https://collabtoolbox.cisco.com/webex-labs).*
